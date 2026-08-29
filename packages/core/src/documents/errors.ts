/**
 * Document service error type.
 *
 * Mirrors `@intelligo-dev/auth`'s `WorkspaceServiceError` exactly (see that
 * file's doc comment for the full rationale): the documents service
 * (./service.ts) throws this for every failure it recognizes rather
 * than returning an ad-hoc `{ success, error }` envelope — that
 * shaping is a transport concern (a Server Action, a route handler)
 * and belongs one layer up, alongside revalidatePath/Sentry/i18n, none
 * of which this package may depend on (core's dependency allowlist is
 * empty — see tests/architecture/dependency-direction.test.ts).
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
  | "not_found"
  | "forbidden"
  | "invalid_input"
  | "database_error";

export class DocumentServiceError extends Error {
  readonly code: DocumentServiceErrorCode;
  // ES2020 target predates the standard `Error.cause` field; declared
  // explicitly so `err.cause` type-checks for callers (the assignment
  // below still happens, this only adds the declaration).
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
