/**
 * The only package that imports `next/*`, so every other package runs outside
 * Next. The auth handlers live in `./auth` so that binding the request context
 * does not load the configured Better-Auth server instance.
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
