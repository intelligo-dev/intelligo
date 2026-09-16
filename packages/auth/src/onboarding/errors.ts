/**
 * Onboarding service error type.
 *
 * Mirrors `../team/errors.ts` and `../workspace/errors.ts`: the
 * onboarding service (./service.ts) throws this for every failure it
 * recognizes rather than returning an ad-hoc `{ success, error }`
 * envelope — that shaping is a transport concern (a Server Action, a
 * route handler) and belongs one layer up, alongside
 * revalidatePath/Sentry/toast/i18n, none of which this package may
 * depend on.
 */

/**
 * - `forbidden` — the caller is unauthenticated.
 * - `invalid_input` — `setStep`'s step id failed validation (empty or
 *   over 64 characters — see `./schemas.ts`).
 * - `not_found` — the caller's `users` row could not be found.
 */
export type OnboardingServiceErrorCode =
  "forbidden" | "invalid_input" | "not_found";

export class OnboardingServiceError extends Error {
  readonly code: OnboardingServiceErrorCode;

  constructor(
    code: OnboardingServiceErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = "OnboardingServiceError";
    this.code = code;
    if (options?.cause !== undefined) {
      // ES2020 target predates the standard `cause` constructor option;
      // assign it directly so `instanceof Error` consumers (and Node's
      // own error inspection) still see it.
      (this as { cause?: unknown }).cause = options.cause;
    }

    // Restore prototype chain (extending built-ins across some
    // transpilation targets loses `instanceof`).
    Object.setPrototypeOf(this, OnboardingServiceError.prototype);
  }
}

export function isOnboardingServiceError(
  error: unknown
): error is OnboardingServiceError {
  return error instanceof OnboardingServiceError;
}
