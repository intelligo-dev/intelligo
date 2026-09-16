/**
 * Identity service error type.
 *
 * Mirrors `../documents/errors.ts` and `../conversations/errors.ts`
 * exactly (see either's doc comment for the full rationale): the
 * identity service (./service.ts) throws this for every failure it
 * recognizes rather than returning an ad-hoc `{ success, error }`
 * envelope. Shaping to a transport-facing envelope (plus
 * Sentry/logging/revalidatePath) is the caller's job, one layer up.
 */

/**
 * - `not_found` — no fact exists at the given id within the actor's
 *   workspace/user scope. Covers both "no such fact" and "a fact that
 *   belongs to a different user in the same workspace" — the two are
 *   deliberately indistinguishable to the caller (same reasoning as
 *   `../conversations/service.ts`'s `verifyConversation`: an id alone
 *   should never reveal whose data exists behind it).
 * - `invalid_input` — a caller-supplied argument failed a basic
 *   invariant (e.g. an empty fact id).
 * - `database_error` — the underlying insert did not return the row it
 *   was expected to.
 */
export type IdentityServiceErrorCode =
  "not_found" | "invalid_input" | "database_error";

export class IdentityServiceError extends Error {
  readonly code: IdentityServiceErrorCode;
  // ES2020 target predates the standard `Error.cause` field; declared
  // explicitly so `err.cause` type-checks for callers (the assignment
  // below still happens, this only adds the declaration).
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
