/**
 * The Next.js adapter — and the only file in the framework that
 * imports `next/*`.
 *
 * Keeping it to one file is what lets every other package be used from
 * a queue worker, a Hono API, a test, or a product built on something
 * that is not Next. `tests/architecture/peer-policy.test.ts` and the
 * `next/*` import test hold the line.
 *
 * `next` is an optional peer here: installing `@intelligo-dev/http`
 * does not require Next, and this subpath is simply not importable
 * without it.
 */

import { headers } from "next/headers";

import type { RequestContextSource } from "./index";

/**
 * Reads the current request's headers from Next's request scope.
 *
 * Bind it once, from the composition root:
 *
 *     setRequestContextSource(nextRequestContext);
 */
export const nextRequestContext: RequestContextSource = () => headers();
