/**
 * Thrown by the conversations service for every failure it recognizes.
 * Shaping it into a transport envelope is the caller's job.
 */

/**
 * - `not_found` — no conversation, or no message, exists at the given
 *   id within the actor's workspace/user scope.
 * - `forbidden` — the target row exists but is outside the actor's
 *   scope (a different workspace or a different user's conversation).
 * - `invalid_input` — a caller-supplied argument failed a basic
 *   invariant (e.g. an empty title, or a batch of messages that
 *   reference a conversation the actor does not own).
 * - `database_error` — the underlying insert/update did not return the
 *   row it was expected to.
 */
export type ConversationServiceErrorCode =
  "not_found" | "forbidden" | "invalid_input" | "database_error";

export class ConversationServiceError extends Error {
  readonly code: ConversationServiceErrorCode;
  // The ES2020 target predates `Error.cause`; declared so `err.cause`
  // type-checks for callers.
  readonly cause?: unknown;

  constructor(
    code: ConversationServiceErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = "ConversationServiceError";
    this.code = code;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
    Object.setPrototypeOf(this, ConversationServiceError.prototype);
  }
}

export function isConversationServiceError(
  error: unknown
): error is ConversationServiceError {
  return error instanceof ConversationServiceError;
}
