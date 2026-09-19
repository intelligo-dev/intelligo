import "server-only";

/**
 * Support impersonation. The audit event is written before the session
 * exists and a failed write aborts; a reason is mandatory (the only record of
 * why); Better-Auth caps the session at 30 minutes and refuses to impersonate
 * an admin. Stopping is recorded too.
 */

import {
  getAuthSession,
  impersonateUser,
  stopImpersonating,
} from "@intelligo-dev/auth";

import { requireAdminOrRefuse } from "./authorization";
import { recordAuditEventOrThrow } from "@intelligo-dev/audit";

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
 * While impersonating, the session cookie belongs to the *target*, stamped
 * with `impersonatedBy`, so the caller is not a platform admin and cannot be
 * gated by `requirePlatformAdmin`. The authority to stop is that stamp; the
 * admin it names is the actor the audit event records.
 *
 * Records the end before ending it, so the trail does not depend on the
 * happy path completing.
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
