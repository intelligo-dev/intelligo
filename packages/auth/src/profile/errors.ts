/**
 * Profile service error type.
 *
 * The profile service (./service.ts) throws this for every failure it
 * recognizes rather than returning an ad-hoc `{ success, error }`
 * envelope — that shaping is a transport concern (a Server Action, a
 * route handler) and belongs one layer up, alongside
 * revalidatePath/Sentry/toast/i18n, none of which this package may
 * depend on. Mirrors `TeamServiceError`/`WorkspaceServiceError`
 * (../team/errors.ts, ../workspace/errors.ts).
 */

/**
 * - `forbidden` — the caller is unauthenticated.
 * - `invalid_input` — schema validation failed.
 * - `provider_error` — the underlying Better-Auth user API call itself
 *   failed (network, upstream API error, etc.).
 */
export type ProfileServiceErrorCode =
  | "forbidden"
  | "invalid_input"
  | "provider_error";

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
      // ES2020 target predates the standard `cause` constructor option;
      // assign it directly so `instanceof Error` consumers (and Node's
      // own error inspection) still see it.
      (this as { cause?: unknown }).cause = options.cause;
    }

    // Restore prototype chain (extending built-ins across some
    // transpilation targets loses `instanceof`).
    Object.setPrototypeOf(this, ProfileServiceError.prototype);
  }
}

export function isProfileServiceError(
  error: unknown
): error is ProfileServiceError {
  return error instanceof ProfileServiceError;
}
