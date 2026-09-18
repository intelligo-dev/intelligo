/**
 * Better-Auth's Next.js route handlers, re-exported from the consumer's
 * `app/api/auth/[...all]/route.ts`. The path must stay `/api/auth`: it is
 * Better-Auth's default `basePath`, and the client and `baseURL` assume it.
 */

import "server-only";

import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@intelligo-dev/auth";

export const { GET, POST } = toNextJsHandler(auth);
