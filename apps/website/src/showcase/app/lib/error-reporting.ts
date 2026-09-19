/**
 * Error-reporting seam — consumer-owned.
 *
 * `RouteError` calls this from every route-level error boundary. The
 * default is a no-op on purpose: registry items never depend on an
 * error-reporting SDK, so a fresh install has nothing to configure and
 * nothing to pay for. Bind your own reporter here and every boundary
 * in the app starts reporting, with no component edit.
 *
 * With Sentry, for example:
 *
 *   import * as Sentry from "@sentry/nextjs";
 *
 *   export function reportRouteError(
 *     error: Error & { digest?: string },
 *     context: RouteErrorContext
 *   ) {
 *     Sentry.captureException(error, { tags: { scope: context.scope } });
 *   }
 *
 * This runs inside a `useEffect` in a client component, so it must not
 * throw — a reporter that fails should swallow its own failure rather
 * than take the error screen down with it.
 */

export interface RouteErrorContext {
  /** Short identifier for the route segment that failed. */
  scope: string;
}

export function reportRouteError(
  _error: Error & { digest?: string },
  _context: RouteErrorContext
): void {
  // No-op until you bind a reporter.
}
