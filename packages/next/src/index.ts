/**
 * The only package that imports `next/*`, so every other package runs outside
 * Next. The auth handlers live in `./auth` and the Route Handler guards in
 * `./route` so that binding the request context does not load the configured
 * Better-Auth server instance.
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

/**
 * What a Server Action returns to its form: the data, or an error
 * message already fit to show. Actions catch their own failures and
 * translate them, so a client branches on `success` instead of catching.
 */
export type ActionResult<T = undefined> =
  { success: true; data: T } | { success: false; error: string };
