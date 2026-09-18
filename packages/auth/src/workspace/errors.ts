/**
 * Thrown for every failure the workspace service recognizes. Shaping it for a UI
 * (a `{ success, error }` envelope, i18n, revalidation) is the transport's job.
 */

/**
 * - `workspace_limit_reached` — the caller's plan-defined workspace cap
 *   would be exceeded by this create (see
 *   `WorkspaceServicePorts.checkWorkspaceLimit`).
 * - `forbidden` — the caller is unauthenticated, has no active
 *   workspace, or lacks the required workspace role.
 * - `invalid_input` — schema validation failed.
 * - `not_found` — the workspace does not exist (e.g. it was deleted
 *   between resolving the caller's active workspace and the provider
 *   call that reads it back).
 * - `provider_error` — the underlying Better-Auth organization-plugin
 *   call itself failed (network, upstream API error, etc.).
 */
export type WorkspaceServiceErrorCode =
  | "workspace_limit_reached"
  | "forbidden"
  | "invalid_input"
  | "not_found"
  | "provider_error";

export interface WorkspaceServiceErrorMeta {
  /** e.g. the plan's workspace limit, for `workspace_limit_reached`. */
  limit?: number;
  [key: string]: unknown;
}

export class WorkspaceServiceError extends Error {
  readonly code: WorkspaceServiceErrorCode;
  readonly meta?: WorkspaceServiceErrorMeta;

  constructor(
    code: WorkspaceServiceErrorCode,
    message: string,
    options?: { meta?: WorkspaceServiceErrorMeta; cause?: unknown }
  ) {
    super(message);
    this.name = "WorkspaceServiceError";
    this.code = code;
    this.meta = options?.meta;
    if (options?.cause !== undefined) {
      // The ES2020 target predates the `cause` constructor option.
      (this as { cause?: unknown }).cause = options.cause;
    }

    // Extending built-ins loses `instanceof` on some transpilation targets.
    Object.setPrototypeOf(this, WorkspaceServiceError.prototype);
  }
}

export function isWorkspaceServiceError(
  error: unknown
): error is WorkspaceServiceError {
  return error instanceof WorkspaceServiceError;
}
