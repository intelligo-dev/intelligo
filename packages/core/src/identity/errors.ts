/**
 * Thrown by the identity service for every failure it recognizes. Shaping
 * it into a transport envelope is the caller's job.
 */

/**
 * - `not_found` — no fact exists at the given id within the actor's
 *   workspace/user scope. Covers both "no such fact" and "a fact that
 *   belongs to a different user in the same workspace" — deliberately
 *   indistinguishable, so an id never reveals whose data exists behind it.
 * - `invalid_input` — a caller-supplied argument failed a basic
 *   invariant (e.g. an empty fact id).
 * - `database_error` — the underlying insert did not return the row it
 *   was expected to.
 */
export type IdentityServiceErrorCode =
  "not_found" | "invalid_input" | "database_error";

export class IdentityServiceError extends Error {
  readonly code: IdentityServiceErrorCode;
  // The ES2020 target predates `Error.cause`; declared so `err.cause`
  // type-checks for callers.
  readonly cause?: unknown;

  constructor(
    code: IdentityServiceErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = "IdentityServiceError";
    this.code = code;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
    Object.setPrototypeOf(this, IdentityServiceError.prototype);
  }
}

export function isIdentityServiceError(
  error: unknown
): error is IdentityServiceError {
  return error instanceof IdentityServiceError;
}
