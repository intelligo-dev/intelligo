/**
 * Team management service — the durable business rules behind
 * workspace membership and invitations, extracted from
 * the product application’s team actions (first slice of the page/registry
 * migration, section C1).
 *
 * Mirrors `createExecutions(ports)` (packages/executions/src/lifecycle.ts):
 * a factory over optional ports, so this package's allowlisted
 * dependency (`@intelligo-dev/core` only — see
 * tests/architecture/dependency-direction.test.ts) never grows to
 * include billing, email, or notifications. A consumer binds those in
 * at its composition root:
 *
 *   const teamService = createTeamService({
 *     checkMemberLimit: checkTeamMemberLimit,       // @intelligo-dev/billing
 *     sendInvitationEmail: ...,                     // see note below
 *     notifyMemberJoined: triggerTeamMemberJoinedNotification, // @intelligo-dev/core/notifications
 *   });
 *
 * Authorization (`requireAuth`/`requireWorkspace`/`requireRole`) lives
 * INSIDE each method, not at the transport. Every recognized failure
 * throws `TeamServiceError` with a stable `code` — no
 * revalidatePath/Sentry/next-intl/toast here; that shaping is the
 * transport's job (a Server Action, a route handler).
 *
 * ---------------------------------------------------------------------
 * Invitation-email duplication (investigated for this extraction)
 * ---------------------------------------------------------------------
 * `packages/auth/src/server.ts` configures the Better-Auth organization
 * plugin's own `sendInvitationEmail` hook (EMAIL-06). Reading the
 * installed org plugin (`better-auth@1.6.30`,
 * `plugins/organization/routes/crud-invites.mjs`): every successful
 * `/organization/invite-member` call — both the "new invitation" path
 * and the "resend" path — unconditionally does
 * `if (ctx.context.orgOptions.sendInvitationEmail) await
 * runInBackgroundOrAwait(orgOptions.sendInvitationEmail(...))` once the
 * invitation row is created. Because `server.ts` always sets that
 * option, the hook fires on every `inviteMember()` call this service
 * makes — there is no code path where it does not.
 *
 * acme's current `actions/team.ts` ALSO calls
 * `@intelligo-dev/core/email`'s `sendInvitationEmail` directly after the
 * same `/organization/invite-member` call. That means **two** emails
 * go out per invitation today. This is a live duplication bug, not a
 * hypothetical.
 *
 * Decision: `inviteMember` below does NOT call `ports.sendInvitationEmail`
 * by default — the org-plugin hook already covers it, so exactly one
 * email fires per invitation as long as `server.ts`'s hook stays wired.
 * The port is kept (and tested) for a consumer that disables or
 * replaces that hook (e.g. a fork of `server.ts`, or a future
 * environment where the org plugin's hook is intentionally left unset)
 * — pass `sendInvitationEmail` and this service will use it. Bumping
 * both at once will resume the duplication; do not turn the port back
 * on without also removing the hook in `server.ts`.
 *
 * ---------------------------------------------------------------------
 * Active-organization resolution (found the same way, via the
 * integration test's real DB)
 * ---------------------------------------------------------------------
 * Better-Auth's organization plugin resolves "the caller's active
 * workspace" from `session.activeOrganizationId` when a call omits an
 * explicit `organizationId`. That column exists
 * (`packages/core/src/db/schema/auth.ts`) and persists switches, but a
 * bare `auth.api.getFullOrganization({ headers })` still resolves to
 * *no* organization whenever the session has none set — a fresh user,
 * a user removed from their active workspace — and the original code
 * relied on it. This service therefore never depends on session state:
 * every `getFullOrganization` call below passes an explicit
 * `organizationId` sourced from `requireWorkspace`/`requireRole`'s
 * resolved `workspace.id` (or, in `acceptInvitation`, the invitation's
 * own `organizationId`).
 */

import { headers } from "next/headers";
import type { ZodType } from "zod";
import { createLogger } from "@intelligo-dev/core/logger";

import { auth } from "../server";
import { requireAuth, requireRole, requireWorkspace } from "../helpers";
import { orgApi, type OrgInvitation, type OrgMember } from "../org-api";
import { inviteMemberSchema, updateRoleSchema } from "./schemas";
import { TeamServiceError, isTeamServiceError } from "./errors";

const log = createLogger("TeamService");

export type TeamServicePorts = {
  /**
   * Plan-defined member cap for a workspace. No port ⇒ unlimited (no
   * gate applied) — matches "no billing dependency without one bound
   * explicitly" (ADR-0005).
   */
  checkMemberLimit?: (
    workspaceId: string,
    currentCount: number
  ) => Promise<{ allowed: boolean; limit: number }>;
  /**
   * Send the invitation email. Kept for a consumer that disables the
   * Better-Auth org-plugin `sendInvitationEmail` hook — see the module
   * doc comment above. `inviteMember` does not call this port unless
   * it is explicitly bound.
   */
  sendInvitationEmail?: (input: {
    to: string;
    inviterName: string;
    workspaceName: string;
    invitationId: string;
    role: string;
  }) => Promise<void>;
  /**
   * Notify the workspace owner that a new member joined. `memberEmail`
   * is included alongside the ports.md-listed fields because
   * `triggerTeamMemberJoinedNotification` (the acme binding) uses it
   * to compose the notification message — dropping it would silently
   * degrade the message text.
   */
  notifyMemberJoined?: (input: {
    workspaceId: string;
    workspaceName: string;
    memberName: string;
    memberEmail: string;
    ownerId: string;
  }) => Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Maps requireAuth/requireWorkspace/requireRole failures to `forbidden`. */
function toForbidden(error: unknown): TeamServiceError {
  if (isTeamServiceError(error)) return error;
  return new TeamServiceError("forbidden", errorMessage(error), {
    cause: error,
  });
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new TeamServiceError(
      "invalid_input",
      result.error.issues.map((issue) => issue.message).join("; ") ||
        "Invalid input",
      { cause: result.error }
    );
  }
  return result.data;
}

export function createTeamService(ports: TeamServicePorts = {}) {
  async function callRequireAuth() {
    try {
      return await requireAuth();
    } catch (error) {
      throw toForbidden(error);
    }
  }

  async function callRequireWorkspace() {
    try {
      return await requireWorkspace();
    } catch (error) {
      throw toForbidden(error);
    }
  }

  async function callRequireRole(
    allowedRoles: Array<"owner" | "admin" | "member">
  ) {
    try {
      return await requireRole(allowedRoles);
    } catch (error) {
      throw toForbidden(error);
    }
  }

  /** Wraps a Better-Auth org-plugin call; unrecognized failures become `provider_error`. */
  async function callOrgApi<T>(
    context: string,
    fn: () => Promise<T>
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (isTeamServiceError(error)) throw error;
      log.error("Org API call failed", { context, error: errorMessage(error) });
      throw new TeamServiceError(
        "provider_error",
        `Better-Auth organization API call failed (${context})`,
        { cause: error }
      );
    }
  }

  /**
   * List members of the caller's active workspace.
   */
  async function listMembers(): Promise<OrgMember[]> {
    const { workspace } = await callRequireWorkspace();
    const hdrs = await headers();

    const org = await callOrgApi("getFullOrganization", () =>
      auth.api.getFullOrganization({
        headers: hdrs,
        query: { organizationId: workspace.id },
      })
    );

    return (org?.members ?? []) as OrgMember[];
  }

  /**
   * List pending invitations for the caller's active workspace.
   */
  async function listInvitations(): Promise<OrgInvitation[]> {
    const { workspace } = await callRequireWorkspace();
    const hdrs = await headers();

    const org = await callOrgApi("getFullOrganization", () =>
      auth.api.getFullOrganization({
        headers: hdrs,
        query: { organizationId: workspace.id },
      })
    );

    return (org?.invitations ?? []) as OrgInvitation[];
  }

  /**
   * Invite a member by email. Owner/admin only (TEAM-01).
   *
   * The member-limit port, when bound, gates the invite before it is
   * created. Exactly one invitation email is sent — see the module doc
   * comment on the email-duplication finding.
   */
  async function inviteMember(input: {
    email: string;
    role: "admin" | "member";
  }): Promise<OrgInvitation | null> {
    const { workspace, user } = await callRequireRole(["owner", "admin"]);
    const validated = parseInput(inviteMemberSchema, input);
    const hdrs = await headers();

    // Check team member limit (FLAG-05), via port only.
    if (ports.checkMemberLimit) {
      const org = await callOrgApi("getFullOrganization", () =>
        auth.api.getFullOrganization({
          headers: hdrs,
          query: { organizationId: workspace.id },
        })
      );
      const currentMemberCount = org?.members?.length ?? 0;

      const limitCheck = await ports.checkMemberLimit(
        workspace.id,
        currentMemberCount
      );
      if (!limitCheck.allowed) {
        throw new TeamServiceError(
          "member_limit_reached",
          `Your plan allows up to ${limitCheck.limit} team member${
            limitCheck.limit === 1 ? "" : "s"
          }. Upgrade to add more members.`,
          { meta: { limit: limitCheck.limit } }
        );
      }
    }

    // Better-Auth's own duplicate-pending-invite guard
    // (USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION) runs inside this
    // call and surfaces as a provider_error if tripped — acme's
    // action never added a second check on top of it, so neither does
    // this service.
    const result = await callOrgApi("invite-member", () =>
      orgApi["/organization/invite-member"]({
        headers: hdrs,
        body: {
          email: validated.email,
          role: validated.role,
          organizationId: workspace.id,
        },
      })
    );

    if (ports.sendInvitationEmail) {
      const invitationId = result?.id ?? "";
      ports
        .sendInvitationEmail({
          to: validated.email,
          inviterName: user.name || "A team member",
          workspaceName: workspace.name,
          invitationId,
          role: validated.role,
        })
        .catch((err) =>
          log.error("Failed to send invitation email", {
            error: errorMessage(err),
          })
        );
    }

    return result;
  }

  /**
   * Accept invitation (TEAM-03).
   *
   * Defence-in-depth against stolen-invitationId attacks: we (a)
   * require the caller to be authenticated, (b) verify the
   * invitationId is in the caller's pending list before forwarding it
   * to Better-Auth, and (c) confirm the user is actually a member of
   * the resulting org after the call. Better-Auth's accept-invitation
   * endpoint already checks the email match, but layering these guards
   * means a future upstream regression can't silently grant
   * cross-tenant access.
   */
  async function acceptInvitation(invitationId: string): Promise<void> {
    const { user } = await callRequireAuth();
    const hdrs = await headers();

    if (typeof invitationId !== "string" || invitationId.length === 0) {
      throw new TeamServiceError("invalid_input", "Invalid invitation id");
    }

    // Pre-check: invitationId must be in the caller's pending list.
    const pending = await callOrgApi("list-user-invitations", () =>
      orgApi["/organization/list-user-invitations"]({ headers: hdrs })
    );
    const matched = pending?.find((inv) => inv.id === invitationId);
    if (!matched) {
      log.warn(
        "acceptInvitation rejected — invitation not in caller's pending list",
        { userId: user.id, invitationId }
      );
      throw new TeamServiceError(
        "invitation_not_found",
        "Invitation not found"
      );
    }

    await callOrgApi("accept-invitation", () =>
      orgApi["/organization/accept-invitation"]({
        headers: hdrs,
        body: { invitationId },
      })
    );

    // Post-check: caller must now be a member of the target org.
    const targetOrg = await callOrgApi("getFullOrganization", () =>
      auth.api.getFullOrganization({
        headers: hdrs,
        query: { organizationId: matched.organizationId },
      })
    );
    const isMember = targetOrg?.members?.some(
      (m: OrgMember) => m.userId === user.id
    );
    if (!isMember) {
      log.error(
        "acceptInvitation post-check failed — not a member after accept",
        {
          userId: user.id,
          invitationId,
          organizationId: matched.organizationId,
        }
      );
      throw new TeamServiceError(
        "accept_verification_failed",
        "Failed to accept invitation"
      );
    }

    // Notify the workspace owner (fire-and-forget, non-blocking —
    // invitation acceptance has already succeeded above).
    //
    // Reuses `targetOrg` from the post-check above (scoped to
    // `matched.organizationId`, the org the caller just joined) rather
    // than re-fetching "the active org" the way acme's original
    // action did: Better-Auth's org plugin needs a
    // `sessions.activeOrganizationId` column to resolve an org from
    // headers alone, and this repo's Drizzle schema for `sessions`
    // does not define one, so a bare `getFullOrganization({ headers })`
    // call resolves to no organization at all — this notify lookup
    // would silently no-op every time. `targetOrg` sidesteps that by
    // asking for the org we already know the answer for.
    if (ports.notifyMemberJoined) {
      try {
        const session = await auth.api.getSession({ headers: hdrs });
        if (session?.session && targetOrg) {
          const owner = targetOrg.members?.find(
            (m: OrgMember) => m.role === "owner"
          );
          if (owner) {
            const memberName = session.user?.name || "A new member";
            const memberEmail = session.user?.email || "";
            ports
              .notifyMemberJoined({
                workspaceId: targetOrg.id,
                workspaceName: targetOrg.name,
                memberName,
                memberEmail,
                ownerId: owner.userId,
              })
              .catch((err) =>
                log.error("Failed to send join notification", {
                  error: errorMessage(err),
                })
              );
          }
        }
      } catch (notifError) {
        log.error("Notification lookup failed", {
          error: errorMessage(notifError),
        });
        // Non-blocking — invitation acceptance still succeeds.
      }
    }
  }

  /**
   * Reject/decline invitation (TEAM-04).
   *
   * Same caller-side guard as acceptInvitation: require auth and
   * verify the invitationId is in the caller's pending list before
   * forwarding.
   */
  async function rejectInvitation(invitationId: string): Promise<void> {
    await callRequireAuth();
    const hdrs = await headers();

    if (typeof invitationId !== "string" || invitationId.length === 0) {
      throw new TeamServiceError("invalid_input", "Invalid invitation id");
    }

    const pending = await callOrgApi("list-user-invitations", () =>
      orgApi["/organization/list-user-invitations"]({ headers: hdrs })
    );
    if (!pending?.some((inv) => inv.id === invitationId)) {
      throw new TeamServiceError(
        "invitation_not_found",
        "Invitation not found"
      );
    }

    await callOrgApi("reject-invitation", () =>
      orgApi["/organization/reject-invitation"]({
        headers: hdrs,
        body: { invitationId },
      })
    );
  }

  /**
   * Cancel a pending invitation. Owner/admin only.
   */
  async function cancelInvitation(invitationId: string): Promise<void> {
    await callRequireRole(["owner", "admin"]);
    const hdrs = await headers();

    await callOrgApi("cancel-invitation", () =>
      orgApi["/organization/cancel-invitation"]({
        headers: hdrs,
        body: { invitationId },
      })
    );
  }

  /**
   * Remove a member from workspace. Owner/admin only (TEAM-06).
   */
  async function removeMember(memberId: string): Promise<void> {
    const { workspace } = await callRequireRole(["owner", "admin"]);
    const hdrs = await headers();

    await callOrgApi("remove-member", () =>
      orgApi["/organization/remove-member"]({
        headers: hdrs,
        body: { memberIdOrEmail: memberId, organizationId: workspace.id },
      })
    );
  }

  /**
   * Update member role. Owner/admin only (TEAM-05, TEAM-08).
   */
  async function updateMemberRole(input: {
    memberId: string;
    role: "admin" | "member";
  }): Promise<void> {
    const { workspace } = await callRequireRole(["owner", "admin"]);
    const validated = parseInput(updateRoleSchema, input);
    const hdrs = await headers();

    await callOrgApi("update-member-role", () =>
      orgApi["/organization/update-member-role"]({
        headers: hdrs,
        body: {
          memberId: validated.memberId,
          role: validated.role,
          organizationId: workspace.id,
        },
      })
    );
  }

  /**
   * Leave workspace (TEAM-09). Sole owner cannot leave — must transfer
   * ownership first.
   */
  async function leaveWorkspace(): Promise<void> {
    const { workspace, membership } = await callRequireWorkspace();
    const hdrs = await headers();

    if (membership.role === "owner") {
      const org = await callOrgApi("getFullOrganization", () =>
        auth.api.getFullOrganization({
          headers: hdrs,
          query: { organizationId: workspace.id },
        })
      );
      const owners =
        org?.members.filter((m: OrgMember) => m.role === "owner") ?? [];
      if (owners.length <= 1) {
        throw new TeamServiceError(
          "sole_owner",
          "Cannot leave workspace as the sole owner. Transfer ownership first."
        );
      }
    }

    await callOrgApi("leave", () =>
      orgApi["/organization/leave"]({
        headers: hdrs,
        body: { organizationId: workspace.id },
      })
    );

    // Switch to another workspace, if one exists.
    const orgs = await callOrgApi("list", () =>
      orgApi["/organization/list"]({ headers: hdrs })
    );
    if (orgs && orgs.length > 0) {
      await callOrgApi("set-active", () =>
        orgApi["/organization/set-active"]({
          headers: hdrs,
          body: { organizationId: orgs[0]!.id },
        })
      );
    }
  }

  /**
   * Transfer workspace ownership to another member. Owner only (TEAM-07).
   */
  async function transferOwnership(targetMemberId: string): Promise<void> {
    const { workspace } = await callRequireRole(["owner"]);
    const hdrs = await headers();

    // Promote target to owner. Note: Better-Auth may handle demotion of
    // the previous owner automatically. If not, the old owner remains
    // as co-owner, which is acceptable (ported behavior).
    await callOrgApi("update-member-role", () =>
      orgApi["/organization/update-member-role"]({
        headers: hdrs,
        body: {
          memberId: targetMemberId,
          role: "owner",
          organizationId: workspace.id,
        },
      })
    );
  }

  /**
   * Get the caller's own pending invitations (for the invitation
   * accept page). No explicit requireAuth here — Better-Auth's
   * list-user-invitations endpoint reads the session off `headers`
   * itself; ported as-is from acme's action.
   */
  async function getUserInvitations(): Promise<OrgInvitation[]> {
    const hdrs = await headers();

    const invitations = await callOrgApi("list-user-invitations", () =>
      orgApi["/organization/list-user-invitations"]({ headers: hdrs })
    );

    return invitations ?? [];
  }

  return {
    listMembers,
    listInvitations,
    inviteMember,
    cancelInvitation,
    removeMember,
    updateMemberRole,
    leaveWorkspace,
    transferOwnership,
    acceptInvitation,
    rejectInvitation,
    getUserInvitations,
  };
}

export type TeamService = ReturnType<typeof createTeamService>;
