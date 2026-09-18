/**
 * Edge-safe session presence check. Middleware runs where no TCP Postgres
 * driver exists, so it never queries the database: it reads the cookie and
 * picks a redirect. A forged or expired cookie gets past it and is rejected
 * server-side by `requireAuth`/`requireWorkspace`/`requireRole`.
 */

import { getSessionCookie } from "better-auth/cookies";

/**
 * True when the request carries a Better-Auth session cookie.
 *
 * Presence only — the cookie's signature is NOT verified and no
 * database read happens. Never use this to authorize access to data;
 * use it to choose a redirect. Authorization belongs to `requireAuth`
 * and friends, which run in the Node runtime against the real session.
 */
export function hasSessionCookie(request: Request): boolean {
  return getSessionCookie(request) !== null;
}

// Re-export for edge routes that reason about workspace roles.
export { type WorkspaceRole } from "./helpers";
