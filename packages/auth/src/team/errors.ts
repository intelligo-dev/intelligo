/**
 * Team service error type.
 *
 * The team service (./service.ts) throws this for every failure it
 * recognizes rather than returning an ad-hoc `{ success, error }`
 * envelope — that shaping is a transport concern (a Server Action, a
 * route handler) and belongs one layer up, alongside
 * revalidatePath/Sentry/toast/i18n, none of which this package may
 * depend on.
 */

/**
 * - `member_limit_reached` — the workspace's plan-defined member cap
 *   would be exceeded by this invite (see `TeamServicePorts.checkMemberLimit`).
 * - `invitation_not_found` — the invitation id is not (or is no longer)
 *   in the caller's own pending list.
 * - `sole_owner` — the caller is the only owner and cannot leave the
 *   workspace without transferring ownership first.
 * - `forbidden` — the caller is unauthenticated, has no active
 *   workspace, or lacks the required workspace role.
 * - `invalid_input` — schema validation failed.
 * - `accept_verification_failed` — Better-Auth's accept-invitation call
 *   returned without the caller actually becoming a member (defence in
 *   depth against a stolen invitation id — see `acceptInvitation`).
 * - `provider_error` — the underlying Better-Auth org-plugin call
 *   itself failed (network, upstream API error, etc.).
 */
export type TeamServiceErrorCode =
  | "member_limit_reached"
  | "invitation_not_found"
  | "sole_owner"
  | "forbidden"
  | "invalid_input"
  | "accept_verification_failed"
  | "provider_error";

export interface TeamServiceErrorMeta {
  /** e.g. the plan's member limit, for `member_limit_reached`. */
  limit?: number;
  [key: string]: unknown;
}

export class TeamServiceError extends Error {
  readonly code: TeamServiceErrorCode;
  readonly meta?: TeamServiceErrorMeta;

  constructor(
    code: TeamServiceErrorCode,
    message: string,
    options?: { meta?: TeamServiceErrorMeta; cause?: unknown }
  ) {
    super(message);
    this.name = "TeamServiceError";
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
    Object.setPrototypeOf(this, TeamServiceError.prototype);
  }
}

export function isTeamServiceError(error: unknown): error is TeamServiceError {
  return error instanceof TeamServiceError;
}
