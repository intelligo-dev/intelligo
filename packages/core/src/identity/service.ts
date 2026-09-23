/**
 * Server-only reads and mutations over the user identity graph: fact
 * listing and deletion, the profile snapshot's write, a full data export,
 * and the memory-audit trail.
 *
 * `deleteFact` does not touch the cached profile snapshot; profile synthesis
 * is the product's AI code, so a caller that owns it re-triggers it and
 * stores the result with `saveProfileSnapshot`.
 *
 * Callers pass a resolved actor (workspaceId, userId); core cannot depend on
 * `@intelligo-dev/auth`. Every query filters by both ids. Every mutation
 * writes a `user_memory_audit` row. Failures throw `IdentityServiceError`.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  userFacts,
  userMemories,
  userProfileSnapshots,
  userMemoryAudit,
} from "../db/schema";
import type {
  UserFact,
  UserMemoryAuditRow,
  UserProfileSnapshot,
} from "../db/schema";
import { recordMemoryAudit } from "./audit";
import { IdentityServiceError } from "./errors";
import type {
  IdentityActor,
  IdentityExport,
  SaveProfileSnapshotInput,
} from "./types";

/**
 * Returns the fact if the actor owns it. Throws
 * IdentityServiceError("not_found") otherwise — another user's fact is
 * indistinguishable from a missing one.
 */
async function verifyFact(
  actor: IdentityActor,
  factId: string
): Promise<UserFact> {
  const [fact] = await db
    .select()
    .from(userFacts)
    .where(eq(userFacts.id, factId))
    .limit(1);

  if (
    !fact ||
    fact.userId !== actor.userId ||
    fact.workspaceId !== actor.workspaceId
  ) {
    throw new IdentityServiceError("not_found", "Fact not found");
  }

  return fact;
}

/** List the actor's facts, most important and most confident first. */
export async function listFacts(actor: IdentityActor): Promise<UserFact[]> {
  return db
    .select()
    .from(userFacts)
    .where(
      and(
        eq(userFacts.userId, actor.userId),
        eq(userFacts.workspaceId, actor.workspaceId)
      )
    )
    .orderBy(desc(userFacts.importance), desc(userFacts.confidence));
}

const MAX_AUDIT_LIMIT = 200;

/**
 * Read the actor's memory-audit trail, most recent first. Optionally
 * scoped to a single target (e.g. one fact's history).
 */
export async function getAuditTrail(
  actor: IdentityActor,
  options?: { limit?: number; targetId?: string }
): Promise<UserMemoryAuditRow[]> {
  const limit = Math.min(
    Math.max(1, options?.limit ?? MAX_AUDIT_LIMIT),
    MAX_AUDIT_LIMIT
  );

  const baseClause = and(
    eq(userMemoryAudit.userId, actor.userId),
    eq(userMemoryAudit.workspaceId, actor.workspaceId)
  );

  return db
    .select()
    .from(userMemoryAudit)
    .where(
      options?.targetId
        ? and(baseClause, eq(userMemoryAudit.targetId, options.targetId))
        : baseClause
    )
    .orderBy(desc(userMemoryAudit.createdAt))
    .limit(limit);
}

/**
 * Delete a fact and record the deletion in the audit trail. Throws
 * `invalid_input` for an empty id and `not_found` for anything outside
 * the actor's scope. Does not re-trigger profile synthesis.
 */
export async function deleteFact(
  actor: IdentityActor,
  factId: string
): Promise<void> {
  if (!factId || factId.trim().length === 0) {
    throw new IdentityServiceError("invalid_input", "factId is required");
  }

  const existing = await verifyFact(actor, factId);

  await db.transaction(async (tx) => {
    await tx.delete(userFacts).where(eq(userFacts.id, factId));
    await recordMemoryAudit(
      {
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        targetKind: "fact",
        targetId: factId,
        action: "delete",
        actorKind: "user",
        actorId: actor.userId,
        beforeValue: existing,
        reason: "user requested deletion",
      },
      tx
    );
  });
}

/**
 * The actor's full identity graph — facts, memories, latest profile
 * snapshot and audit trail — for a "download my data" flow. Records its own
 * audit row (action "export").
 */
export async function exportIdentity(
  actor: IdentityActor
): Promise<IdentityExport> {
  // Recorded before the reads so the export's own audit row is part of
  // the export — the trail a user downloads should show that download.
  await recordMemoryAudit({
    userId: actor.userId,
    workspaceId: actor.workspaceId,
    targetKind: "snapshot",
    targetId: actor.userId,
    action: "export",
    actorKind: "user",
    actorId: actor.userId,
    reason: "user requested data export",
  });

  const [facts, memories, snapshotRows, audit] = await Promise.all([
    db
      .select()
      .from(userFacts)
      .where(
        and(
          eq(userFacts.userId, actor.userId),
          eq(userFacts.workspaceId, actor.workspaceId)
        )
      ),
    db
      .select()
      .from(userMemories)
      .where(
        and(
          eq(userMemories.userId, actor.userId),
          eq(userMemories.workspaceId, actor.workspaceId)
        )
      ),
    db
      .select()
      .from(userProfileSnapshots)
      .where(
        and(
          eq(userProfileSnapshots.userId, actor.userId),
          eq(userProfileSnapshots.workspaceId, actor.workspaceId)
        )
      )
      .limit(1),
    db
      .select()
      .from(userMemoryAudit)
      .where(
        and(
          eq(userMemoryAudit.userId, actor.userId),
          eq(userMemoryAudit.workspaceId, actor.workspaceId)
        )
      )
      .orderBy(desc(userMemoryAudit.createdAt)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    user: { id: actor.userId, workspaceId: actor.workspaceId },
    facts,
    memories,
    snapshot: snapshotRows[0] ?? null,
    audit,
  };
}

/**
 * Store the actor's synthesized profile — one row per user per workspace,
 * inserted on the first synthesis and replaced on every later one. The
 * version is bumped in the same statement (`ON CONFLICT … version + 1`),
 * so two syntheses racing each other get two versions rather than one
 * overwriting the other's number; it starts at 1.
 *
 * A field left `undefined` keeps what the row holds (null on insert); an
 * explicit `null` clears it. `synthesizedAt` defaults to now. Records an
 * audit row (`snapshot`, `create` or `update`) in the same transaction,
 * attributed to `input.actorKind` — `system_job` unless the caller says
 * otherwise. Throws `invalid_input` for an empty summary.
 */
export async function saveProfileSnapshot(
  actor: IdentityActor,
  input: SaveProfileSnapshotInput
): Promise<UserProfileSnapshot> {
  if (!input.summary || input.summary.trim().length === 0) {
    throw new IdentityServiceError("invalid_input", "summary is required");
  }
  if (input.factsDigest === undefined || input.factsDigest === null) {
    throw new IdentityServiceError("invalid_input", "factsDigest is required");
  }

  const replaced = {
    summary: input.summary,
    factsDigest: input.factsDigest,
    synthesizedAt: input.synthesizedAt ?? new Date(),
    ...definedOnly({
      summaryEn: input.summaryEn,
      summaryMn: input.summaryMn,
      activeGoals: input.activeGoals,
      personalitySignals: input.personalitySignals,
      relationshipNotes: input.relationshipNotes,
      synthesizedByModel: input.synthesizedByModel,
      nextSynthesisAt: input.nextSynthesisAt,
      triggerReason: input.triggerReason,
    }),
  };

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(userProfileSnapshots)
      .values({
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        version: 1,
        ...replaced,
      })
      .onConflictDoUpdate({
        target: [userProfileSnapshots.userId, userProfileSnapshots.workspaceId],
        set: {
          ...replaced,
          version: sql`${userProfileSnapshots.version} + 1`,
        },
      })
      .returning();

    if (!row) {
      throw new IdentityServiceError(
        "database_error",
        "Failed to save profile snapshot"
      );
    }

    await recordMemoryAudit(
      {
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        targetKind: "snapshot",
        targetId: actor.userId,
        action: row.version === 1 ? "create" : "update",
        actorKind: input.actorKind ?? "system_job",
        actorId: input.actorId,
        afterValue: { version: row.version, triggerReason: row.triggerReason },
        reason: input.reason,
      },
      tx
    );

    return row;
  });
}

/** The entries whose value is not `undefined` — `null` is kept, to clear. */
function definedOnly<T extends Record<string, unknown>>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}
