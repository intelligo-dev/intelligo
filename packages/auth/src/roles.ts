/**
 * Its own module because server.ts and helpers.ts both need it, and
 * server.ts cannot import helpers.ts, which imports server.ts.
 */

/**
 * Grants the operational console and, through Better-Auth's admin
 * plugin, the ability to impersonate a user for support.
 *
 * Not a workspace role. Workspace `owner` is per-tenant — every
 * self-serve signup owns a workspace — so anything cross-tenant gated
 * on it is gated on nothing.
 */
export const PLATFORM_ADMIN_ROLE = "platform-admin";

/**
 * Where a user stands as a platform admin: `hasRole` reads `users.role`
 * (comma-separated), `allowlisted` reads PLATFORM_ADMIN_EMAILS, the
 * bootstrap that `requirePlatformAdmin` promotes into the column.
 */
export function platformAdminStanding(user: {
  email?: string | null;
  role?: string | null;
}): { allowlisted: boolean; hasRole: boolean; roles: string[] } {
  const allowlist = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const email = user.email?.toLowerCase();
  const roles = (user.role ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  return {
    allowlisted: !!email && allowlist.includes(email),
    hasRole: roles.includes(PLATFORM_ADMIN_ROLE),
    roles,
  };
}
