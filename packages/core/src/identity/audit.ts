/**
 * Writes `user_memory_audit` rows. Core may not import
 * `@intelligo-dev/audit` (only audit -> core is allowed), so the write lives
 * here and audit exports only the event contract. Internal to identity; not
 * re-exported.
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

/**
 * `writer` is the transaction of the mutation being audited, so the
 * change and its record commit or fail together.
 */
export async function recordMemoryAudit(
  input: RecordMemoryAuditInput,
  writer: Pick<typeof db, "insert"> = db
): Promise<UserMemoryAuditRow> {
  const [row] = await writer
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
