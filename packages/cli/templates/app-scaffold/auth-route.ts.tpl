/**
 * Better-Auth's HTTP mount.
 *
 * Every call the auth client makes is a request to `/api/auth/*` on
 * this app's own origin; without this file none of those routes exist
 * and every sign-in POST answers 404. The handlers come from
 * `@intelligo-dev/next`, the framework's one Next.js adapter, so the
 * consumer never has to depend on `better-auth` directly.
 */

export { GET, POST } from "@intelligo-dev/next/auth";
