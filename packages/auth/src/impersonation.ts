import "server-only";

/**
 * Session mechanics of impersonation only. Nothing here checks
 * authorization: the policy (who may, audited or refused, a mandatory
 * reason) lives in `@intelligo-dev/admin`, and these must only be called
 * through it.
 */

import { getRequestHeaders } from "@intelligo-dev/core/request-context";

import { auth } from "./server";

export type ImpersonatedSession = {
  targetUserId: string;
  /** When Better-Auth will expire it — capped in the auth config. */
  expiresAt: Date;
};

/** Default matching `impersonationSessionDuration` in server.ts. */
const FALLBACK_DURATION_MS = 30 * 60_000;

/**
 * Swap the caller's session cookie for one belonging to `targetUserId`.
 *
 * Better-Auth refuses if the target is themselves a platform admin.
 */
export async function impersonateUser(
  targetUserId: string
): Promise<ImpersonatedSession> {
  const result = (await auth.api.impersonateUser({
    body: { userId: targetUserId },
    headers: await getRequestHeaders(),
  })) as { session?: { expiresAt?: string | Date } };

  const expiresAt = result.session?.expiresAt;

  return {
    targetUserId,
    expiresAt: expiresAt
      ? new Date(expiresAt)
      : new Date(Date.now() + FALLBACK_DURATION_MS),
  };
}

/** Restore the admin's own session. */
export async function stopImpersonating(): Promise<void> {
  await auth.api.stopImpersonating({ headers: await getRequestHeaders() });
}
