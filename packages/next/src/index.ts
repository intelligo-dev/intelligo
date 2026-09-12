/**
 * The Next.js adapter — the one package in the framework that imports
 * `next/*`.
 *
 * Keeping every `next` import here is what lets every other package be
 * used from a queue worker, a Hono API, a test, or a product built on
 * something that is not Next. `tests/architecture/peer-policy.test.ts`
 * holds the line: no other package's source may import `next/*`.
 *
 * Two subpaths, kept apart on purpose:
 *
 *   - `@intelligo-dev/next` — `nextRequestContext`, bound once from
 *     the composition root so `@intelligo-dev/core/request-context`
 *     knows where a request's headers come from.
 *   - `@intelligo-dev/next/auth` — Better-Auth's route handlers for
 *     `app/api/auth/[...all]/route.ts`.
 *
 * Binding the request context must not load the configured Better-Auth
 * server instance, which is why the handlers are not exported here.
 */

import { headers } from "next/headers";

import type { RequestContextSource } from "@intelligo-dev/core/request-context";

/**
 * Reads the current request's headers from Next's request scope.
 *
 * Bind it once, from the composition root:
 *
 *     setRequestContextSource(nextRequestContext);
 */
export const nextRequestContext: RequestContextSource = () => headers();
