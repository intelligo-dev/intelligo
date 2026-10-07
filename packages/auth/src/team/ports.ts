/** The ports `createTeamService` takes; each is optional. */

export type TeamServicePorts = {
  /**
   * Plan-defined member cap for a workspace. No port ⇒ unlimited.
   * `currentCount` is the seats already spoken for: members plus pending
   * invitations when inviting, members when an invitation is accepted.
   */
  checkMemberLimit?: (
    workspaceId: string,
    currentCount: number
  ) => Promise<{ allowed: boolean; limit: number }>;
  /**
   * Send the invitation email. Bind it only when the org plugin's own
   * `sendInvitationEmail` hook in `server.ts` is disabled: that hook fires
   * on every invite, and binding both sends two emails.
   */
  sendInvitationEmail?: (input: {
    to: string;
    inviterName: string;
    workspaceName: string;
    invitationId: string;
    role: string;
  }) => Promise<void>;
  /**
   * How many invitations a user may send. Called before every invite;
   * `allowed: false` refuses it as `rate_limited`. Invitation emails go to
   * any address from the deployment's own domain, so a binding caps them
   * per user and per workspace. No port ⇒ no cap beyond the member limit.
   */
  checkInvitationRate?: (input: {
    userId: string;
    workspaceId: string;
  }) => Promise<{ allowed: boolean }>;
  /** Notify the workspace owner that a new member joined. */
  notifyMemberJoined?: (input: {
    workspaceId: string;
    workspaceName: string;
    memberName: string;
    memberEmail: string;
    ownerId: string;
  }) => Promise<void>;
};
