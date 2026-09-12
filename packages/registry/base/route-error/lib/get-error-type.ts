/**
 * Classifies an error into a known category from its message/digest.
 *
 * Route-level error boundaries use this to pick a translation key in
 * the `route-error` namespace, so a network blip and a server fault
 * don't both render the same shrug. Central rather than per-route:
 * the classification is the same everywhere, only the copy differs.
 */

export type ErrorType = "generic" | "network" | "timeout" | "server";

/**
 * Classifies an error, falling back to either the standard `generic`
 * key or a route-specific one (e.g. `conversation`) when no rule
 * matches. The type parameter narrows the return type so callers get
 * full type-checking on the fallback they pass in.
 */
export function getErrorType<F extends string = "generic">(
  error: Error & { digest?: string },
  fallback?: F
): ErrorType | F {
  const message = error.message?.toLowerCase() ?? "";
  const digest = error.digest?.toLowerCase() ?? "";

  if (
    message.includes("network") ||
    message.includes("fetch") ||
    digest.includes("network")
  ) {
    return "network";
  }
  if (message.includes("timeout") || digest.includes("timeout")) {
    return "timeout";
  }
  if (
    message.includes("500") ||
    message.includes("503") ||
    digest.includes("server")
  ) {
    return "server";
  }
  return (fallback ?? "generic") as F;
}
