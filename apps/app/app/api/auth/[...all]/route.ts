/**
 * Better-Auth's HTTP mount.
 *
 * Every call the auth client makes is a request to `/api/auth/*` on
 * this app's own origin; without this file every sign-in POST answers
 * 404. The handlers come from `@intelligo-dev/next`, so the app never
 * depends on `better-auth` directly.
 */

export { GET, POST } from "@intelligo-dev/next/auth";
