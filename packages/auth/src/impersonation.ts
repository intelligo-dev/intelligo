import "server-only";

/**
 * Session-level impersonation.
 *
 * This module owns only the session mechanics, because that is what
 * @intelligo/auth owns: it holds the Better-Auth instance and the
 * request headers. The *policy* — who may do it, that it is audited or
 * refused, that a reason is mandatory — lives in @intelligo/admin, and
 * these functions must not be called without going through it.
 *
 * Nothing here re-checks authorization. Splitting the check from the
 * act would give two places that can disagree about who is an admin,
 * which is the mistake that put cross-tenant analytics behind a
 * workspace role.
 */

import { headers } from "next/headers";

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
    headers: await headers(),
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
  await auth.api.stopImpersonating({ headers: await headers() });
}
