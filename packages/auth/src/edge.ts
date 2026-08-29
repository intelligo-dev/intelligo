/**
 * Edge-safe session presence check.
 *
 * Middleware runs in the Edge Runtime, where no TCP Postgres driver is
 * available. The previous version of this module solved that by
 * instantiating Better-Auth against the Neon HTTP driver — which made
 * middleware silently Neon-only. Against any other Postgres the session
 * query failed with `TypeError: fetch failed`, Better-Auth turned that
 * into `APIError: Failed to get session`, and the middleware threw: every
 * request to the app returned HTTP 500. The old code hid this behind a
 * `NODE_ENV === "development"` bypass that skipped auth entirely, so the
 * failure only appeared in a production build on a non-Neon database.
 *
 * The fix is to stop querying the database from the edge at all.
 * Middleware performs an OPTIMISTIC check: it reads the session cookie
 * and decides where to send the request. It never asserts that the
 * session is valid.
 *
 * The authoritative check stays server-side, where it always was —
 * `requireAuth`/`requireWorkspace`/`requireRole` and the authenticated
 * layout's own `getAuthSession()` redirect. A forged or expired cookie
 * gets past middleware and is then rejected by the page or action that
 * actually reads data. This is the pattern Better-Auth documents for
 * Next.js middleware, and it is what makes the guard work on any
 * Postgres, in any runtime, with one code path in every environment.
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
