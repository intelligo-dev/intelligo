/**
 * Workspace membership and invitations. Each method authorizes itself and
 * throws `TeamServiceError`; billing, email and notifications arrive as ports
 * bound at the composition root.
 *
 * Every `getFullOrganization` call passes an explicit `organizationId`: the
 * session's active organization is unset for a fresh user or one removed
 * from their active workspace, and a bare call then resolves to nothing.
 */

import { getRequestHeaders } from "@intelligo-dev/core/request-context";
import type { ZodType } from "zod";
import { createLogger } from "@intelligo-dev/core/logger";

import { auth } from "../server";
import { requireAuth, requireRole, requireWorkspace } from "../helpers";
import { orgApi, type OrgInvitation, type OrgMember } from "../org-api";
import { inviteMemberSchema, updateRoleSchema } from "./schemas";
import { TeamServiceError, isTeamServiceError } from "./errors";

const log = createLogger("TeamService");

export type TeamServicePorts = {
  /** Plan-defined member cap for a workspace. No port ⇒ unlimited. */
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
  /** Notify the workspace owner that a new member joined. */
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

  /** Members of the caller's active workspace. */
  async function listMembers(): Promise<OrgMember[]> {
    const { workspace } = await callRequireWorkspace();
    const hdrs = await getRequestHeaders();

    const org = await callOrgApi("getFullOrganization", () =>
      auth.api.getFullOrganization({
        headers: hdrs,
        query: { organizationId: workspace.id },
      })
    );

    return (org?.members ?? []) as OrgMember[];
  }

  /** Pending invitations for the caller's active workspace. */
  async function listInvitations(): Promise<OrgInvitation[]> {
    const { workspace } = await callRequireWorkspace();
    const hdrs = await getRequestHeaders();

    const org = await callOrgApi("getFullOrganization", () =>
      auth.api.getFullOrganization({
        headers: hdrs,
        query: { organizationId: workspace.id },
      })
    );

    // Better-Auth keeps accepted, rejected and canceled invitations on
    // the organization; only a pending one can still be acted on.
    return ((org?.invitations ?? []) as OrgInvitation[]).filter(
      (invitation) => invitation.status === "pending"
    );
  }

  /**
   * Invite a member by email. Owner/admin only. The member-limit port,
   * when bound, gates the invite before it is created.
   */
  async function inviteMember(input: {
    email: string;
    role: "admin" | "member";
  }): Promise<OrgInvitation | null> {
    const { workspace, user } = await callRequireRole(["owner", "admin"]);
    const validated = parseInput(inviteMemberSchema, input);
    const hdrs = await getRequestHeaders();

    // Member limit, via port only.
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
    // call and surfaces as a provider_error.
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
   * Accept an invitation.
   *
   * Defence in depth against a stolen invitation id: the caller must be
   * authenticated, the id must be in the caller's pending list, and the
   * caller must be a member of the organization afterwards. Better-Auth
   * already checks the email match; these guards keep a regression there
   * from granting cross-tenant access.
   */
  async function acceptInvitation(invitationId: string): Promise<void> {
    const { user } = await callRequireAuth();
    const hdrs = await getRequestHeaders();

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

    // Notify the owner, fire-and-forget: acceptance has already succeeded.
    // Uses `targetOrg`, the organization just joined, rather than resolving
    // one from the session.
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
        // Acceptance still succeeds.
      }
    }
  }

  /**
   * Decline an invitation.
   *
   * Same caller-side guard as acceptInvitation: require auth and
   * verify the invitationId is in the caller's pending list before
   * forwarding.
   */
  async function rejectInvitation(invitationId: string): Promise<void> {
    await callRequireAuth();
    const hdrs = await getRequestHeaders();

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

  /** Cancel a pending invitation. Owner/admin only. */
  async function cancelInvitation(invitationId: string): Promise<void> {
    await callRequireRole(["owner", "admin"]);
    const hdrs = await getRequestHeaders();

    await callOrgApi("cancel-invitation", () =>
      orgApi["/organization/cancel-invitation"]({
        headers: hdrs,
        body: { invitationId },
      })
    );
  }

  /** Remove a member from the workspace. Owner/admin only. */
  async function removeMember(memberId: string): Promise<void> {
    const { workspace } = await callRequireRole(["owner", "admin"]);
    const hdrs = await getRequestHeaders();

    await callOrgApi("remove-member", () =>
      orgApi["/organization/remove-member"]({
        headers: hdrs,
        body: { memberIdOrEmail: memberId, organizationId: workspace.id },
      })
    );
  }

  /** Change a member's role. Owner/admin only. */
  async function updateMemberRole(input: {
    memberId: string;
    role: "admin" | "member";
  }): Promise<void> {
    const { workspace } = await callRequireRole(["owner", "admin"]);
    const validated = parseInput(updateRoleSchema, input);
    const hdrs = await getRequestHeaders();

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
   * Leave the workspace. The sole owner cannot leave without transferring
   * ownership first.
   */
  async function leaveWorkspace(): Promise<void> {
    const { workspace, membership } = await callRequireWorkspace();
    const hdrs = await getRequestHeaders();

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

  /** Transfer workspace ownership to another member. Owner only. */
  async function transferOwnership(targetMemberId: string): Promise<void> {
    const { workspace } = await callRequireRole(["owner"]);
    const hdrs = await getRequestHeaders();

    // Promotes the target to owner. If Better-Auth does not demote the
    // previous owner, they stay a co-owner.
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
   * The caller's own pending invitations, for the accept page. No
   * `requireAuth`: Better-Auth's list-user-invitations endpoint reads the
   * session off `headers` itself.
   */
  async function getUserInvitations(): Promise<OrgInvitation[]> {
    const hdrs = await getRequestHeaders();

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
