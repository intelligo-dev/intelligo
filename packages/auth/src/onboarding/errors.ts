/**
 * Thrown for every failure the onboarding service recognizes. Shaping it for a UI
 * (a `{ success, error }` envelope, i18n, revalidation) is the transport's job.
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
      // The ES2020 target predates the `cause` constructor option.
      (this as { cause?: unknown }).cause = options.cause;
    }

    // Extending built-ins loses `instanceof` on some transpilation targets.
    Object.setPrototypeOf(this, OnboardingServiceError.prototype);
  }
}

export function isOnboardingServiceError(
  error: unknown
): error is OnboardingServiceError {
  return error instanceof OnboardingServiceError;
}
