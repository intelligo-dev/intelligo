/**
 * Thrown by the documents service for every failure it recognizes. Shaping
 * it into a transport envelope is the caller's job.
 */

/**
 * - `not_found` — no document (or no version of it) exists at the
 *   given id within the actor's workspace/user scope.
 * - `forbidden` — a document with this id exists but is owned by a
 *   different user within the same workspace.
 * - `invalid_input` — a caller-supplied argument failed a basic
 *   invariant (e.g. an unparsable or out-of-window delete timestamp).
 * - `database_error` — the underlying insert/update did not return the
 *   row it was expected to.
 */
export type DocumentServiceErrorCode =
  "not_found" | "forbidden" | "invalid_input" | "database_error";

export class DocumentServiceError extends Error {
  readonly code: DocumentServiceErrorCode;
  // The ES2020 target predates `Error.cause`; declared so `err.cause`
  // type-checks for callers.
  readonly cause?: unknown;

  constructor(
    code: DocumentServiceErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = "DocumentServiceError";
    this.code = code;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
    Object.setPrototypeOf(this, DocumentServiceError.prototype);
  }
}

export function isDocumentServiceError(
  error: unknown
): error is DocumentServiceError {
  return error instanceof DocumentServiceError;
}
