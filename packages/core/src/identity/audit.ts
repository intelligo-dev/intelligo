/**
 * Memory-audit write — the intended destination, reconciled with the
 * allowlist.
 *
 * The package boundary names `@intelligo-dev/audit` as
 * `recordMemoryAudit`'s destination.
 * `tests/architecture/dependency-direction.test.ts` only grants the
 * audit -> core edge (`audit: ["@intelligo-dev/core"]`);
 * `@intelligo-dev/core`'s own allowlist entry is empty
 * (`core: []` — see `../documents/service.ts`'s doc comment for the
 * same constraint against `@intelligo-dev/auth`). This module — part of
 * `@intelligo-dev/core/identity`, which owns `user_memory_audit` alongside
 * the rest of the identity graph (see `../db/schema/identity.ts`) —
 * therefore cannot import `@intelligo-dev/audit` to call a writer defined
 * there.
 *
 * `@intelligo-dev/audit` exports the event *contract* only
 * (`packages/audit/src/memory-audit.ts`, re-exported from its index).
 * This file is the faithful, in-package port of the write itself,
 * ported verbatim from `@intelligo-dev/agents/memory/audit.ts`,
 * kept local so `./service.ts`'s mutations (`deleteFact`,
 * `exportIdentity`) never cross the disallowed core -> audit edge.
 * Not re-exported from `./index.ts`: it is this module's own
 * implementation detail, not identity's public API.
 */

import { db } from "../db";
import { userMemoryAudit } from "../db/schema";
import type {
  AuditTargetKind,
  AuditAction,
  AuditActorKind,
  UserMemoryAuditRow,
} from "../db/schema";
import { IdentityServiceError } from "./errors";

export type RecordMemoryAuditInput = {
  userId: string;
  workspaceId: string;
  targetKind: AuditTargetKind;
  targetId: string;
  action: AuditAction;
  actorKind: AuditActorKind;
  actorId?: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  reason?: string;
};

export async function recordMemoryAudit(
  input: RecordMemoryAuditInput
): Promise<UserMemoryAuditRow> {
  const [row] = await db
    .insert(userMemoryAudit)
    .values({
      id: crypto.randomUUID(),
      userId: input.userId,
      workspaceId: input.workspaceId,
      targetKind: input.targetKind,
      targetId: input.targetId,
      action: input.action,
      actorKind: input.actorKind,
      actorId: input.actorId,
      beforeValue: input.beforeValue,
      afterValue: input.afterValue,
      reason: input.reason,
      createdAt: new Date(),
    })
    .returning();

  if (!row) {
    throw new IdentityServiceError(
      "database_error",
      "Failed to record memory audit event"
    );
  }

  return row;
}
