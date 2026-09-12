/**
 * Better-Auth's Next.js route handlers.
 *
 * The auth client (`@intelligo-dev/auth/client`) talks to the app's own
 * origin at `/api/auth/*` — sign-in, sign-up, email verification,
 * password reset, OAuth callbacks and every organization-plugin
 * endpoint. Something has to mount the configured `auth` instance
 * there, and only this package knows how it is configured, so the
 * handlers are built here and the consumer's route file is a one-line
 * re-export it owns:
 *
 * ```ts
 * // app/api/auth/[...all]/route.ts
 * export { GET, POST } from "@intelligo-dev/next/auth";
 * ```
 *
 * The path must stay `/api/auth` — it is Better-Auth's default
 * `basePath`, and both the client and the configured `baseURL` assume
 * it.
 */

import "server-only";

import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@intelligo-dev/auth";

export const { GET, POST } = toNextJsHandler(auth);
