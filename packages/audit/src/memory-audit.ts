/**
 * Memory-audit event contract.
 *
 * The package boundary names `@intelligo-dev/audit` as
 * `recordMemoryAudit`'s destination ("`recordMemoryAudit` to `audit`").
 * The dependency
 * allowlist doesn't cooperate with a literal move, though
 * (tests/architecture/dependency-direction.test.ts): this package may
 * depend on `@intelligo-dev/core` (`audit: ["@intelligo-dev/core"]`), but
 * `@intelligo-dev/core` may depend on nothing (`core: []`) — the same
 * constraint `packages/core/src/documents/service.ts` and
 * `.../conversations/service.ts` already document for
 * `@intelligo-dev/auth`. `user_facts`/`user_memories`/
 * `user_profile_snapshots`/`user_memory_audit` are owned by
 * `packages/core/src/identity` (see that module's doc comment), and
 * that module cannot import this package to call a writer defined
 * here — the allowlist only grants the audit -> core edge, never
 * core -> audit.
 *
 * What actually lands here, then, is the event *contract*: the shape a
 * memory-audit write takes, re-exported from the schema module that
 * already owns it. The write itself is a faithful, in-package port at
 * `packages/core/src/identity/audit.ts`, used internally by the
 * identity service (`deleteFact`, `exportIdentity`) so it never
 * crosses the disallowed core -> audit edge. This module is the public
 * seam for anyone else who depends on `@intelligo-dev/audit` (executions,
 * admin, billing) and wants to describe a memory-audit event without
 * reaching into `@intelligo-dev/core/identity`'s internals.
 *
 * `packages/audit/src/db/schema.ts` already documents where this
 * settles: `user_memory_audit` folds into `audit_events` once the
 * memory subsystem's ownership question closes (see
 * docs/inventory/export-classification.md), and this contract
 * graduates to backing that table's writer directly.
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
 * The shape `recordMemoryAudit`
 * (`packages/core/src/identity/audit.ts`) accepts. Kept here — not in
 * `@intelligo-dev/core/identity` — so a package that depends on
 * `@intelligo-dev/audit` but not on the identity service directly has a
 * stable type to code against.
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
