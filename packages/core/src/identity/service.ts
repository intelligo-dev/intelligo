/**
 * Identity Service — Server-only
 *
 * Privacy-facing reads and mutations over the user identity graph:
 * fact listing/deletion, a full-identity data export, and the
 * memory-audit trail that records every mutation to a user's facts,
 * memories, and synthesized profile snapshot. Ported from the first
 * product's `actions/identity.ts` (ADR-0008/ADR-0009 precedent — see
 * `../documents/service.ts` and `../conversations/service.ts` for the
 * same move): the tables (`user_facts`, `user_memories`,
 * `user_profile_snapshots`, `user_memory_audit`) always lived in
 * `@intelligo-dev/core`'s schema (`../db/schema/identity.ts`, documented
 * there as "a platform-level memory primitive — separate from any
 * single product"); only the service layer sat in the product
 * application.
 *
 * What did NOT come with it (stays product/agents-side):
 *   - `updateMyFactImportance` and the `synthesizeProfile()` re-trigger
 *     the product's `deleteMyFact` ran after deleting — synthesis is
 *     the product's AI code (ADR-0003), and this package cannot depend
 *     on it. `deleteFact` below does not touch the cached snapshot; a
 *     caller that also owns a synthesis engine re-triggers it after
 *     calling this.
 *
 * Callers pass a resolved actor (workspaceId, userId) rather than this
 * module resolving one itself — `@intelligo-dev/core` cannot depend on
 * `@intelligo-dev/auth` (see tests/architecture/dependency-direction.test.ts).
 * Every query filters by workspaceId AND userId internally; the actor
 * is never trusted to have done that itself.
 *
 * Every mutation writes a `user_memory_audit` row via the internal
 * `recordMemoryAudit` (./audit.ts). See that file's doc comment for
 * why the writer lives here rather than in `@intelligo-dev/audit`, which
 * is where ADR-0008 names its destination — the allowlist only grants
 * audit -> core, never core -> audit
 * (tests/architecture/dependency-direction.test.ts), so
 * `@intelligo-dev/audit` exports the event *contract* only.
 *
 * Failure is reported by throwing `IdentityServiceError` rather than
 * returning a `{ success, error }` envelope — see ./errors.ts.
 *
 * This module is SERVER-ONLY. Do not import from client components.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  userFacts,
  userMemories,
  userProfileSnapshots,
  userMemoryAudit,
} from "../db/schema";
import type { UserFact, UserMemoryAuditRow } from "../db/schema";
import { recordMemoryAudit } from "./audit";
import { IdentityServiceError } from "./errors";
import type { IdentityActor, IdentityExport } from "./types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Verify fact ownership and return the row. Throws
 * IdentityServiceError("not_found") for both a missing fact and one
 * owned by a different user/workspace — a fact belonging to someone
 * else should be indistinguishable from one that doesn't exist at all
 * (same reasoning as `../conversations/service.ts`'s
 * `verifyConversation`).
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

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Delete a fact and record the deletion in the audit trail. Throws
 * `invalid_input` for an empty id and `not_found` for anything outside
 * the actor's scope (see `verifyFact`). Does NOT re-trigger profile
 * synthesis — see the module doc comment.
 */
export async function deleteFact(
  actor: IdentityActor,
  factId: string
): Promise<void> {
  if (!factId || factId.trim().length === 0) {
    throw new IdentityServiceError("invalid_input", "factId is required");
  }

  const existing = await verifyFact(actor, factId);

  await db.delete(userFacts).where(eq(userFacts.id, factId));

  await recordMemoryAudit({
    userId: actor.userId,
    workspaceId: actor.workspaceId,
    targetKind: "fact",
    targetId: factId,
    action: "delete",
    actorKind: "user",
    actorId: actor.userId,
    beforeValue: existing,
    reason: "user requested deletion",
  });
}

// ---------------------------------------------------------------------------
// Export — full identity dump for GDPR / "download my data"
// ---------------------------------------------------------------------------

/**
 * Aggregate the actor's full identity graph — facts, memories, latest
 * profile snapshot, and full audit trail — for a data-export flow.
 * Records its own audit row (action "export"): the export operation
 * audits itself, same as the implementation it was ported from.
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
