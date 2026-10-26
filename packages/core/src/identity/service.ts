/**
 * Server-only reads and mutations over the user identity graph: fact
 * listing, recording, confirmation and deletion, the profile snapshot's
 * write, a full data export, and the memory-audit trail.
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
  USER_FACT_CATEGORIES,
  USER_FACT_EXTRACTION_METHODS,
  userFacts,
  userMemories,
  userProfileSnapshots,
  userMemoryAudit,
} from "../db/schema";
import type {
  UserFact,
  UserFactExtractionMethod,
  UserMemoryAuditRow,
  UserProfileSnapshot,
} from "../db/schema";
import { recordMemoryAudit } from "./audit";
import { IdentityServiceError } from "./errors";
import type {
  FactAuditBy,
  IdentityActor,
  IdentityExport,
  RecordFactInput,
  RecordFactResult,
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
 * Delete a fact and record the deletion in the audit trail. The audit row
 * names the fact by id and kind only — what the fact said is gone with
 * it. Throws `invalid_input` for an empty id and `not_found` for anything
 * outside the actor's scope. Does not re-trigger profile synthesis.
 *
 * `by` names who removed it; without it the user did, at their request.
 */
export async function deleteFact(
  actor: IdentityActor,
  factId: string,
  by?: FactAuditBy
): Promise<void> {
  if (!factId || factId.trim().length === 0) {
    throw new IdentityServiceError("invalid_input", "factId is required");
  }

  await verifyFact(actor, factId);

  await db.transaction(async (tx) => {
    await tx.delete(userFacts).where(eq(userFacts.id, factId));
    await recordMemoryAudit(
      {
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        targetKind: "fact",
        targetId: factId,
        action: "delete",
        ...(by
          ? { actorKind: by.actorKind ?? "agent", actorId: by.actorId }
          : { actorKind: "user", actorId: actor.userId }),
        reason: by ? by.reason : "user requested deletion",
      },
      tx
    );
  });
}

/** Methods by which the person themselves stated a fact. */
const STATED_BY_USER = new Set<UserFactExtractionMethod>([
  "explicit_user_input",
  "onboarding_form",
]);

/**
 * Store a fact for the actor, or replace the one under the same
 * category and key, with a `create` or `update` audit row in the same
 * transaction.
 *
 * A fact the person wrote (`explicit_user_input`) is ground truth: an
 * `llm_extraction` no more confident than it leaves it in place, and the
 * result says `written: false`.
 *
 * The audit row names the user for a fact they stated and an agent for
 * an extracted one, unless the input says otherwise. Throws
 * `invalid_input` for an empty key, a category outside
 * `USER_FACT_CATEGORIES`, a method outside `USER_FACT_EXTRACTION_METHODS`,
 * a confidence outside 0 to 1, a non-integer importance or no value.
 */
export async function recordFact(
  actor: IdentityActor,
  input: RecordFactInput
): Promise<RecordFactResult> {
  validateFact(input);

  const stated = STATED_BY_USER.has(input.extractionMethod);
  const fields = {
    value: input.value,
    confidence: input.confidence,
    extractionMethod: input.extractionMethod,
    ...definedOnly({
      importance: input.importance,
      sourceProduct: input.sourceProduct,
      sourceSessionId: input.sourceSessionId,
      sourceMessageId: input.sourceMessageId,
      expiresAt: input.expiresAt,
    }),
    // Stating a fact is confirming it.
    ...(stated ? { lastConfirmedAt: new Date() } : {}),
  };

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(userFacts)
      .where(
        and(
          eq(userFacts.userId, actor.userId),
          eq(userFacts.workspaceId, actor.workspaceId),
          eq(userFacts.category, input.category),
          eq(userFacts.key, input.key)
        )
      )
      .limit(1)
      .for("update");

    if (
      existing &&
      existing.extractionMethod === "explicit_user_input" &&
      input.extractionMethod === "llm_extraction" &&
      input.confidence <= existing.confidence
    ) {
      return { fact: existing, written: false };
    }

    const [fact] = existing
      ? await tx
          .update(userFacts)
          .set(fields)
          .where(eq(userFacts.id, existing.id))
          .returning()
      : await tx
          .insert(userFacts)
          .values({
            id: crypto.randomUUID(),
            userId: actor.userId,
            workspaceId: actor.workspaceId,
            category: input.category,
            key: input.key,
            ...fields,
          })
          .returning();

    if (!fact) {
      throw new IdentityServiceError("database_error", "Failed to record fact");
    }

    await recordMemoryAudit(
      {
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        targetKind: "fact",
        targetId: fact.id,
        action: existing ? "update" : "create",
        actorKind: input.actorKind ?? (stated ? "user" : "agent"),
        actorId: input.actorId ?? (stated ? actor.userId : undefined),
        beforeValue: existing ? auditedFact(existing) : undefined,
        afterValue: auditedFact(fact),
        reason: input.reason,
      },
      tx
    );

    return { fact, written: true };
  });
}

/**
 * Mark a fact as confirmed by the person now, optionally with a new
 * confidence, and record an `update` audit row. Throws `invalid_input`
 * for an empty id or a confidence outside 0 to 1, and `not_found` for a
 * fact outside the actor's scope.
 */
export async function confirmFact(
  actor: IdentityActor,
  factId: string,
  options: FactAuditBy & { confidence?: number } = {}
): Promise<UserFact> {
  if (!factId || factId.trim().length === 0) {
    throw new IdentityServiceError("invalid_input", "factId is required");
  }
  if (options.confidence !== undefined) assertConfidence(options.confidence);

  const before = await verifyFact(actor, factId);
  const actorKind = options.actorKind ?? "user";

  return db.transaction(async (tx) => {
    const [fact] = await tx
      .update(userFacts)
      .set({
        lastConfirmedAt: new Date(),
        ...definedOnly({ confidence: options.confidence }),
      })
      .where(eq(userFacts.id, factId))
      .returning();

    if (!fact) {
      throw new IdentityServiceError("not_found", "Fact not found");
    }

    await recordMemoryAudit(
      {
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        targetKind: "fact",
        targetId: factId,
        action: "update",
        actorKind,
        actorId:
          options.actorId ?? (actorKind === "user" ? actor.userId : undefined),
        beforeValue: auditedFact(before),
        afterValue: auditedFact(fact),
        reason: options.reason,
      },
      tx
    );

    return fact;
  });
}

/** What a fact's audit row records of it. */
function auditedFact(fact: UserFact) {
  return {
    category: fact.category,
    key: fact.key,
    value: fact.value,
    confidence: fact.confidence,
    extractionMethod: fact.extractionMethod,
    lastConfirmedAt: fact.lastConfirmedAt?.toISOString() ?? null,
  };
}

function validateFact(input: RecordFactInput): void {
  if (!input.key || input.key.trim().length === 0) {
    throw new IdentityServiceError("invalid_input", "key is required");
  }
  if (!(USER_FACT_CATEGORIES as readonly string[]).includes(input.category)) {
    throw new IdentityServiceError(
      "invalid_input",
      `category must be one of ${USER_FACT_CATEGORIES.join(", ")}`
    );
  }
  if (
    !(USER_FACT_EXTRACTION_METHODS as readonly string[]).includes(
      input.extractionMethod
    )
  ) {
    throw new IdentityServiceError(
      "invalid_input",
      `extractionMethod must be one of ${USER_FACT_EXTRACTION_METHODS.join(", ")}`
    );
  }
  assertConfidence(input.confidence);
  if (input.importance !== undefined && !Number.isInteger(input.importance)) {
    throw new IdentityServiceError(
      "invalid_input",
      "importance must be an integer"
    );
  }
  if (input.value === undefined || input.value === null) {
    throw new IdentityServiceError("invalid_input", "value is required");
  }
}

function assertConfidence(confidence: number): void {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new IdentityServiceError(
      "invalid_input",
      "confidence must be between 0 and 1"
    );
  }
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

/**
 * Clear everything the memory-audit trail holds about a user, in every
 * workspace: on the rows about them, the subject, the recorded values and
 * the reason (and the actor, when it was them); on the rows where they
 * acted on someone else, the actor. What happened, to which target and
 * when stays. The append-only trigger lets exactly this through. Returns
 * the number of rows changed. For an account's erasure, called before the
 * user row is deleted — afterwards nothing links the rows to them.
 */
export async function eraseUserFromMemoryAudit(
  userId: string
): Promise<number> {
  if (!userId) {
    throw new IdentityServiceError("invalid_input", "userId is required");
  }
  return db.transaction(async (tx) => {
    const subject = await tx
      .update(userMemoryAudit)
      .set({
        userId: null,
        actorId: sql`CASE WHEN ${userMemoryAudit.actorId} = ${userId} THEN NULL ELSE ${userMemoryAudit.actorId} END`,
        beforeValue: null,
        afterValue: null,
        reason: null,
      })
      .where(eq(userMemoryAudit.userId, userId))
      .returning({ id: userMemoryAudit.id });
    const actor = await tx
      .update(userMemoryAudit)
      .set({ actorId: null })
      .where(eq(userMemoryAudit.actorId, userId))
      .returning({ id: userMemoryAudit.id });
    return subject.length + actor.length;
  });
}

/** The entries whose value is not `undefined` — `null` is kept, to clear. */
function definedOnly<T extends Record<string, unknown>>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}
