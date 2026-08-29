import "server-only";

/**
 * Team service binding — the composition-root wiring for the
 * team-settings item. Binds the plan-defined member limit
 * (`@intelligo/billing`) and the "member joined" in-app notification
 * (`@intelligo/core/notifications`) into the framework-owned team
 * service (`@intelligo/auth`).
 *
 * `sendInvitationEmail` is intentionally left unbound: the
 * organization plugin's `sendInvitationEmail` hook (wired in
 * `@intelligo/auth`'s Better-Auth server config) already sends the
 * invitation email for every `inviteMember()` call. Binding this port
 * too would send a duplicate email — see the doc comment on
 * `createTeamService` for the full trace.
 */

import { createTeamService } from "@intelligo/auth";
import { checkTeamMemberLimit } from "@intelligo/billing";
import { triggerTeamMemberJoinedNotification } from "@intelligo/core/notifications";

export const team = createTeamService({
  checkMemberLimit: checkTeamMemberLimit,
  notifyMemberJoined: ({ workspaceId, memberName, memberEmail, ownerId }) =>
    triggerTeamMemberJoinedNotification({
      userId: ownerId,
      workspaceId,
      memberName,
      memberEmail,
    }),
});
