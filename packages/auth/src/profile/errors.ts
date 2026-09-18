/**
 * Thrown for every failure the profile service recognizes. Shaping it for a UI
 * (a `{ success, error }` envelope, i18n, revalidation) is the transport's job.
 */

/**
 * - `forbidden` — the caller is unauthenticated.
 * - `invalid_input` — schema validation failed.
 * - `provider_error` — the underlying Better-Auth user API call itself
 *   failed (network, upstream API error, etc.).
 */
export type ProfileServiceErrorCode =
  "forbidden" | "invalid_input" | "provider_error";

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
