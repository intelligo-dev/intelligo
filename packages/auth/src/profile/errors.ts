/**
 * Thrown for every failure the profile service recognizes. Shaping it for a UI
 * (a `{ success, error }` envelope, i18n, revalidation) is the transport's job.
 */

/**
 * - `forbidden` — the caller is unauthenticated.
 * - `invalid_input` — schema validation failed.
 * - `provider_error` — the underlying Better-Auth user API call itself
 *   failed (network, upstream API error, etc.).
 * - `reauthentication_required` — deleting the account needs a session
 *   signed in within the last day, and one that is not an impersonation.
 *   Restoring one needs a session signed in after it was deleted.
 * - `sole_owner` — the caller is the only owner of a workspace that has
 *   other members; they transfer ownership or delete that workspace
 *   first. `meta.workspaces` lists those workspaces' names.
 * - `not_scheduled` — restore was asked for an account that is not
 *   scheduled for deletion.
 * - `restore_expired` — the grace period ended; the account can no
 *   longer be restored.
 */
export type ProfileServiceErrorCode =
  | "forbidden"
  | "invalid_input"
  | "provider_error"
  | "reauthentication_required"
  | "sole_owner"
  | "not_scheduled"
  | "restore_expired";

export interface ProfileServiceErrorMeta {
  [key: string]: unknown;
}

export class ProfileServiceError extends Error {
  readonly code: ProfileServiceErrorCode;
  readonly meta?: ProfileServiceErrorMeta;

  constructor(
    code: ProfileServiceErrorCode,
    message: string,
    options?: { meta?: ProfileServiceErrorMeta; cause?: unknown }
  ) {
    super(message);
    this.name = "ProfileServiceError";
    this.code = code;
    this.meta = options?.meta;
    if (options?.cause !== undefined) {
      // The ES2020 target predates the `cause` constructor option.
      (this as { cause?: unknown }).cause = options.cause;
    }

    // Extending built-ins loses `instanceof` on some transpilation targets.
    Object.setPrototypeOf(this, ProfileServiceError.prototype);
  }
}

export function isProfileServiceError(
  error: unknown
): error is ProfileServiceError {
  return error instanceof ProfileServiceError;
}
