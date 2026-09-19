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
 * For one thing only: an optional optimistic redirect in a consumer's
 * `proxy.ts` / `middleware.ts`, sending a visitor with no cookie to the
 * login page before the page renders. The scaffold does not use it; its
 * session redirect runs server-side in the `(app)` layout.
 *
 * Presence only — the cookie's signature is NOT verified and no database
 * read happens, so this is never authorization. A forged or expired cookie
 * passes it and is rejected by `requireAuth` and friends, which every
 * layout, action and route handler still calls.
 *
 * @example
 * const intl = createIntlMiddleware(routing);
 * export default function proxy(request: NextRequest) {
 *   const isApp = /^\/(?:[a-z]{2}\/)?dashboard(?:\/|$)/.test(request.nextUrl.pathname);
 *   if (isApp && !hasSessionCookie(request))
 *     return NextResponse.redirect(new URL("/login", request.url));
 *   return intl(request);
 * }
 */
export function hasSessionCookie(request: Request): boolean {
  return getSessionCookie(request) !== null;
}

// Re-export for edge routes that reason about workspace roles.
export { type WorkspaceRole } from "./helpers";
