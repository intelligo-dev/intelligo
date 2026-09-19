import "server-only";

/**
 * Impersonation's session mechanics, gated on the platform admin role. The
 * rest of the policy (an audit event that must be durable first, a mandatory
 * reason) lives in `@intelligo-dev/admin`; a product calls
 * `startImpersonation` / `stopImpersonation` there, never these directly.
 */

import { eq } from "drizzle-orm";

import { db } from "@intelligo-dev/core/db";
import { users } from "@intelligo-dev/core/db/schema";
import { getRequestHeaders } from "@intelligo-dev/core/request-context";

import { AuthGuardError } from "./guard-error";
import { requirePlatformAdmin } from "./helpers";
import { platformAdminStanding } from "./roles";
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
 * The caller must be a platform admin and the target must not be one, by
 * role or by the PLATFORM_ADMIN_EMAILS allowlist: both are checked here,
 * before Better-Auth's own checks, so no import path reaches the session
 * swap without them.
 *
 * @throws AuthGuardError `unauthenticated` with no session, `forbidden` when
 *   the caller is not a platform admin or the target is one.
 */
export async function impersonateUser(
  targetUserId: string
): Promise<ImpersonatedSession> {
  await requirePlatformAdmin();

  const [target] = await db
    .select({ email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (target) {
    // Protective here, so the allowlist counts whether or not the
    // target has verified the address yet.
    const { allowlisted, hasRole } = platformAdminStanding({
      ...target,
      emailVerified: true,
    });
    if (allowlisted || hasRole) {
      throw new AuthGuardError(
        "forbidden",
        "A platform admin cannot be impersonated"
      );
    }
  }

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

/**
 * Restore the admin's own session.
 *
 * Not gated on the platform admin role: while impersonating, the caller's
 * session is the target's. Better-Auth refuses a session that carries no
 * `impersonatedBy`, and restores only the admin session its signed cookie
 * names.
 */
export async function stopImpersonating(): Promise<void> {
  await auth.api.stopImpersonating({ headers: await getRequestHeaders() });
}
