/**
 * @intelligo-dev/audit — append-only record of who did what.
 *
 * Emitting is deliberately failure-tolerant: an audit write must never
 * break the operation being audited. `recordAuditEvent` swallows and
 * logs; callers that need the guarantee (impersonation, destructive
 * support actions — Phase 5) use `recordAuditEventOrThrow`.
 */

import { db } from "@intelligo-dev/core/db";
import { createLogger } from "@intelligo-dev/core/logger";
import { createRegistry } from "@intelligo-dev/core/registry";
import { and, desc, eq, lt } from "drizzle-orm";

import { auditEvents } from "./db/schema";

const log = createLogger("Audit");

// ---------------------------------------------------------------------------
// Sinks — the open-core seam
// ---------------------------------------------------------------------------

/**
 * Called after an event is durably recorded.
 *
 * This is an extension point, not a plugin system: sinks are
 * registered by the composition root, never by being imported
 * (ADR-0005). What it exists for is the governance work that does not
 * belong in a permissively-licensed package — tamper-evidence,
 * retention policy, shipping the trail to a customer's SIEM — so that
 * a closed module can add it without this package knowing it exists,
 * and without anyone forking this file.
 *
 * A sink runs after the write, so it cannot corrupt or delay the audit
 * row itself, and its failures are isolated: an exporter with an
 * expired credential must not break the operation being audited, nor
 * the other sinks.
 */
export type AuditSink = (event: RecordedAuditEvent) => Promise<void> | void;

/**
 * The row as written, which is what a sink needs to act on.
 *
 * Spelled out rather than inferred from `toRow`: inference gives `id`
 * the template-literal type of `crypto.randomUUID()`, which is not
 * what comes back out of the database, so every consumer would have to
 * widen it.
 */
export type RecordedAuditEvent = {
  id: string;
  workspaceId: string | null;
  actorId: string | null;
  actorKind: string;
  action: string;
  resourceKind: string;
  resourceId: string | null;
  outcome: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

const sinks = createRegistry<AuditSink>("audit/sinks");

/** Register (or replace) a sink under a stable name. */
export function registerAuditSink(name: string, sink: AuditSink): void {
  sinks.set(name, sink);
}

export function registeredAuditSinks(): string[] {
  return [...sinks.keys()];
}

export function clearAuditSinks(): void {
  sinks.clear();
}

async function fanOut(event: RecordedAuditEvent): Promise<void> {
  if (sinks.size === 0) return;

  await Promise.all(
    [...sinks.entries()].map(async ([name, sink]) => {
      try {
        await sink(event);
      } catch (error) {
        log.error("Audit sink failed", {
          sink: name,
          action: event.action,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })
  );
}

export type AuditActorKind = "user" | "system" | "support";
export type AuditOutcome = "ok" | "failed";

export type AuditEventInput = {
  /** Omit for platform-level events with no tenant. */
  workspaceId?: string | null;
  /** Omit for system actors (cron, webhook, job runner). */
  actorId?: string | null;
  actorKind?: AuditActorKind;
  /** Dotted verb, e.g. "execution.completed". */
  action: string;
  /** Resource type, e.g. "execution". */
  resourceKind: string;
  resourceId?: string | null;
  outcome?: AuditOutcome;
  metadata?: Record<string, unknown>;
};

function toRow(event: AuditEventInput) {
  return {
    id: crypto.randomUUID(),
    workspaceId: event.workspaceId ?? null,
    actorId: event.actorId ?? null,
    actorKind: event.actorKind ?? (event.actorId ? "user" : "system"),
    action: event.action,
    resourceKind: event.resourceKind,
    resourceId: event.resourceId ?? null,
    outcome: event.outcome ?? "ok",
    metadata: event.metadata ?? null,
  };
}

/**
 * Record an audit event. Never throws — a failed audit write is logged
 * and swallowed so it cannot take down the audited operation.
 */
export async function recordAuditEvent(event: AuditEventInput): Promise<void> {
  try {
    const row = toRow(event);
    await db.insert(auditEvents).values(row);
    await fanOut({ ...row, createdAt: new Date() });
  } catch (error) {
    log.error("Audit write failed", {
      action: event.action,
      resourceKind: event.resourceKind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Record an audit event, propagating failures. Use where the audit
 * trail is part of the contract (impersonation, destructive support
 * actions) and the operation must abort if it cannot be recorded.
 */
export async function recordAuditEventOrThrow(
  event: AuditEventInput
): Promise<void> {
  const row = toRow(event);
  await db.insert(auditEvents).values(row);
  // Sinks stay failure-isolated even here. The contract this function
  // adds is that the *event was recorded*; a downstream exporter being
  // unreachable does not make it unrecorded, and failing the caller
  // over it would mean an expired SIEM token could block impersonation
  // and every destructive support action.
  await fanOut({ ...row, createdAt: new Date() });
}

export type QueryAuditEventsOptions = {
  workspaceId?: string;
  action?: string;
  resourceKind?: string;
  resourceId?: string;
  /** Keyset pagination: return events created strictly before this. */
  before?: Date;
  limit?: number;
};

/** Most-recent-first query for the admin console (Phase 5). */
export async function queryAuditEvents(options: QueryAuditEventsOptions = {}) {
  const filters = [
    options.workspaceId
      ? eq(auditEvents.workspaceId, options.workspaceId)
      : undefined,
    options.action ? eq(auditEvents.action, options.action) : undefined,
    options.resourceKind
      ? eq(auditEvents.resourceKind, options.resourceKind)
      : undefined,
    options.resourceId
      ? eq(auditEvents.resourceId, options.resourceId)
      : undefined,
    options.before ? lt(auditEvents.createdAt, options.before) : undefined,
  ].filter(Boolean);

  return db
    .select()
    .from(auditEvents)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(auditEvents.createdAt))
    .limit(Math.min(options.limit ?? 50, 500));
}

export { auditEvents } from "./db/schema";
export type { AuditEvent, InsertAuditEvent } from "./db/schema";

// Memory-audit event contract (ADR-0008) — see ./memory-audit.ts for
// why this is a type-only re-export rather than a second writer.
export type {
  AuditTargetKind as MemoryAuditTargetKind,
  AuditAction as MemoryAuditAction,
  AuditActorKind as MemoryAuditActorKind,
  UserMemoryAuditRow,
  InsertUserMemoryAudit,
  RecordMemoryAuditInput,
} from "./memory-audit";
