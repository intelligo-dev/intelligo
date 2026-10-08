import "server-only";

/**
 * Team service binding — the composition-root wiring for the
 * team-settings item. Binds the plan-defined member limit
 * (`@intelligo-dev/billing`) and the "member joined" in-app notification
 * (`@intelligo-dev/core/notifications`) into the framework-owned team
 * service (`@intelligo-dev/auth`).
 *
 * `sendInvitationEmail` is intentionally left unbound: the
 * organization plugin's `sendInvitationEmail` hook (wired in
 * `@intelligo-dev/auth`'s Better-Auth server config) already sends the
 * invitation email for every `inviteMember()` call. Binding this port
 * too would send a duplicate email — see the doc comment on
 * `createTeamService` for the full trace.
 */

import { createTeamService } from "@intelligo-dev/auth";
import { checkRateLimit, checkTeamMemberLimit } from "@intelligo-dev/billing";
import { triggerTeamMemberJoinedNotification } from "@intelligo-dev/core/notifications";

/** Invitations one person, and one workspace, may send per hour. */
const INVITATIONS_PER_HOUR = { user: 20, workspace: 50 };
const HOUR_MS = 60 * 60 * 1000;

export const team = createTeamService({
  checkMemberLimit: checkTeamMemberLimit,
  // Invitation emails reach any address from this deployment's domain,
  // so they are capped per sender and per workspace.
  checkInvitationRate: async ({ userId, workspaceId }) => {
    const [byUser, byWorkspace] = await Promise.all([
      checkRateLimit(`user:${userId}`, {
        limit: INVITATIONS_PER_HOUR.user,
        windowMs: HOUR_MS,
        endpoint: "invitation",
      }),
      checkRateLimit(workspaceId, {
        limit: INVITATIONS_PER_HOUR.workspace,
        windowMs: HOUR_MS,
        endpoint: "invitation",
      }),
    ]);
    return { allowed: byUser.allowed && byWorkspace.allowed };
  },
  notifyMemberJoined: ({ workspaceId, memberName, memberEmail, ownerId }) =>
    triggerTeamMemberJoinedNotification({
      userId: ownerId,
      workspaceId,
      memberName,
      memberEmail,
    }),
});
