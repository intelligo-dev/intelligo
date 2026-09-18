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
