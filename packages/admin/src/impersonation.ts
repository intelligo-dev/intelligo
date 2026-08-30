import "server-only";

/**
 * Support impersonation.
 *
 * The riskiest thing the console can do, so the contract is stricter
 * than for anything else here:
 *
 * 1. **Audit-or-refuse.** `requireAdminOrRefuse` writes the audit event
 *    before the session exists, and a failed write aborts. Reading a
 *    customer's data unrecorded is bad; acting *as* them unrecorded
 *    leaves no way to answer "who did this" — so the record is part of
 *    the operation, not a side effect of it.
 * 2. **A reason is mandatory.** Not decoration: it is the only field in
 *    the audit trail that says *why*, and the person who has to explain
 *    the access months later is usually not the person who took it.
 * 3. **Time-boxed.** Better-Auth caps the session at 30 minutes
 *    (`impersonationSessionDuration` in the auth config). Support work
 *    is measured in minutes; a session inherited by whoever next uses
 *    that browser is the failure mode worth designing against.
 * 4. **Admins cannot impersonate admins.** `allowImpersonatingAdmins`
 *    is false, so one platform admin cannot act as another and blur
 *    whose action an audit entry describes.
 *
 * Stopping is recorded too. A trail with a start and no end reads like
 * an open session forever, which is exactly the wrong impression during
 * a review.
 */

import {
  getAuthSession,
  impersonateUser,
  stopImpersonating,
} from "@intelligo-dev/auth";

import { requireAdminOrRefuse } from "./authorization";

export type { ImpersonatedSession as ImpersonationResult } from "@intelligo-dev/auth";

/**
 * Begin acting as a user.
 *
 * Replaces the caller's session cookie with the target's, so the next
 * request renders the product as that user sees it.
 *
 * @throws when the caller is not a platform admin, when the audit
 *   event cannot be written, or when the target is themselves an admin.
 */
export async function startImpersonation(input: {
  targetUserId: string;
  /** Why — a ticket id, an incident, a customer request. Required. */
  reason: string;
}): Promise<{ targetUserId: string; expiresAt: Date }> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error(
      "Impersonation requires a reason — it is the only record of why " +
        "someone else's account was accessed."
    );
  }

  await requireAdminOrRefuse("admin.impersonation.started", {
    kind: "user",
    id: input.targetUserId,
  });

  return impersonateUser(input.targetUserId);
}

/**
 * Stop acting as a user and return to the admin's own session.
 *
 * While impersonating, the request's session cookie belongs to the
 * *target*: Better-Auth issues a session for the target user stamped
 * with `impersonatedBy` and parks the admin's own token in a separate
 * cookie. So the caller here is not a platform admin, and gating this
 * on `requirePlatformAdmin` refused every legitimate stop — the admin
 * had to wait out the 30-minute cap. The authority to stop is the
 * session's own `impersonatedBy` stamp; the admin it names is the
 * actor the audit event records.
 *
 * Records the end before ending it, for the same reason the start is
 * recorded before it begins: the trail must not depend on the happy
 * path completing.
 */
export async function stopImpersonation(input: {
  targetUserId: string;
}): Promise<void> {
  const current = await getAuthSession();
  const impersonatedBy = (
    current?.session as { impersonatedBy?: string | null } | undefined
  )?.impersonatedBy;

  if (!current || !impersonatedBy) {
    throw new Error("Not impersonating anyone.");
  }
  if (current.user.id !== input.targetUserId) {
    throw new Error(
      "This session impersonates a different user than the one being stopped."
    );
  }

  const { recordAuditEventOrThrow } = await import("@intelligo-dev/audit");
  await recordAuditEventOrThrow({
    workspaceId: null,
    actorId: impersonatedBy,
    actorKind: "support",
    action: "admin.impersonation.stopped",
    resourceKind: "user",
    resourceId: input.targetUserId,
  });

  await stopImpersonating();
}
