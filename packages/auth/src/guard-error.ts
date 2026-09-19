/**
 * Thrown by `requireAuth`, `requireWorkspace`, `requireRole` and
 * `requirePlatformAdmin`. A transport picks its status from `code`; the
 * message is for logs and never reaches a user.
 */

/**
 * - `unauthenticated` — no valid session (401).
 * - `no_workspace` — signed in, but a member of no workspace.
 * - `forbidden` — signed in, but lacking the required role (403).
 */
export type AuthGuardErrorCode =
  "unauthenticated" | "no_workspace" | "forbidden";

const MESSAGES: Record<AuthGuardErrorCode, string> = {
  unauthenticated: "Unauthorized",
  no_workspace: "No active workspace",
  forbidden: "Insufficient permissions",
};

export class AuthGuardError extends Error {
  readonly code: AuthGuardErrorCode;

  constructor(code: AuthGuardErrorCode, message: string = MESSAGES[code]) {
    super(message);
    this.name = "AuthGuardError";
    this.code = code;

    // Extending built-ins loses `instanceof` on some transpilation targets.
    Object.setPrototypeOf(this, AuthGuardError.prototype);
  }
}

export function isAuthGuardError(error: unknown): error is AuthGuardError {
  return error instanceof AuthGuardError;
}
