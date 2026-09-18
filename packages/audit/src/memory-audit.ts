/**
 * Memory-audit event contract.
 *
 * `@intelligo-dev/core` may depend on nothing, so the identity module
 * that owns `user_memory_audit` cannot call a writer defined here; the
 * write lives in `packages/core/src/identity/audit.ts`. This module is
 * the public type for packages that depend on `@intelligo-dev/audit`
 * and want to describe a memory-audit event without reaching into
 * `@intelligo-dev/core/identity`'s internals.
 */

import type {
  AuditTargetKind,
  AuditAction,
  AuditActorKind,
  UserMemoryAuditRow,
  InsertUserMemoryAudit,
} from "@intelligo-dev/core/db/schema";

export type {
  AuditTargetKind,
  AuditAction,
  AuditActorKind,
  UserMemoryAuditRow,
  InsertUserMemoryAudit,
};

/**
 * The shape `recordMemoryAudit` (`packages/core/src/identity/audit.ts`)
 * accepts.
 */
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
