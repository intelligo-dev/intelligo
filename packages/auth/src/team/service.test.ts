/**
 * Team service unit tests.
 *
 * Mocks `../helpers` (requireAuth/requireWorkspace/requireRole),
 * `../server` (auth.api.getFullOrganization/getSession), and
 * `../org-api` (orgApi) — the same seam acme's former
 * actions/__tests__/team.test.ts mocked, just one layer down. Focused
 * on role gating, the limit port, the sole-owner-leave guard, the
 * accept pre/post-check, and TeamServiceError codes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above the file's static imports, so
// anything they reference must be born inside vi.hoisted (see
// helpers.test.ts for the same note).
const mocks = vi.hoisted(() => {
  const requireAuth = vi.fn();
  const requireRole = vi.fn();
  const requireWorkspace = vi.fn();
  const headersMock = vi.fn(async () => new Headers());

  const getFullOrganization = vi.fn();
  const getSession = vi.fn();

  const orgApi = {
    "/organization/invite-member": vi.fn(),
    "/organization/accept-invitation": vi.fn(),
    "/organization/reject-invitation": vi.fn(),
    "/organization/cancel-invitation": vi.fn(),
    "/organization/remove-member": vi.fn(),
    "/organization/update-member-role": vi.fn(),
    "/organization/leave": vi.fn(),
    "/organization/list": vi.fn(),
    "/organization/set-active": vi.fn(),
    "/organization/list-user-invitations": vi.fn(),
  };

  return {
    requireAuth,
    requireRole,
    requireWorkspace,
    headersMock,
    getFullOrganization,
    getSession,
    orgApi,
  };
});

vi.mock("next/headers", () => ({ headers: mocks.headersMock }));

vi.mock("@intelligo-dev/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../helpers", () => ({
  requireAuth: mocks.requireAuth,
  requireRole: mocks.requireRole,
  requireWorkspace: mocks.requireWorkspace,
}));

vi.mock("../server", () => ({
  auth: {
    api: {
      getFullOrganization: mocks.getFullOrganization,
      getSession: mocks.getSession,
    },
  },
}));

vi.mock("../org-api", () => ({
  orgApi: mocks.orgApi,
}));

import { createTeamService } from "./service";
import { isTeamServiceError } from "./errors";

const baseCtx = {
  workspace: { id: "ws-1", name: "Acme" },
  user: { id: "u-1", name: "User One", email: "u@example.com" },
  membership: { role: "owner" },
};

beforeEach(() => {
  vi.resetAllMocks();

  mocks.headersMock.mockImplementation(async () => new Headers());
  mocks.requireAuth.mockResolvedValue(baseCtx);
  mocks.requireWorkspace.mockResolvedValue(baseCtx);
  mocks.requireRole.mockResolvedValue(baseCtx);

  for (const key of Object.keys(mocks.orgApi) as Array<
    keyof typeof mocks.orgApi
  >) {
    mocks.orgApi[key].mockResolvedValue({});
  }
  mocks.orgApi["/organization/list-user-invitations"].mockResolvedValue([
    { id: "inv-1", organizationId: "ws-1" },
  ]);
  mocks.getFullOrganization.mockResolvedValue({
    id: "ws-1",
    name: "Acme",
    members: [{ userId: "u-1", role: "member" }],
  });
});

// ---------------------------------------------------------------------------
// listMembers / listInvitations
// ---------------------------------------------------------------------------

describe("listMembers + listInvitations", () => {
  it("returns members from the active org", async () => {
    mocks.getFullOrganization.mockResolvedValue({
      members: [{ userId: "u-1", role: "owner" }],
      invitations: [],
    });
    const service = createTeamService();

    expect(await service.listMembers()).toHaveLength(1);
  });

  it("returns invitations from the active org", async () => {
    mocks.getFullOrganization.mockResolvedValue({
      members: [],
      invitations: [{ id: "inv-1", email: "a@test.com" }],
    });
    const service = createTeamService();

    expect(await service.listInvitations()).toHaveLength(1);
  });

  it("throws a forbidden TeamServiceError when there is no active workspace", async () => {
    mocks.requireWorkspace.mockRejectedValue(new Error("No active workspace"));
    const service = createTeamService();

    await expect(service.listMembers()).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(service.listInvitations()).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

// ---------------------------------------------------------------------------
// inviteMember
// ---------------------------------------------------------------------------

describe("inviteMember", () => {
  it("requires owner/admin", async () => {
    const service = createTeamService();
    mocks.orgApi["/organization/invite-member"].mockResolvedValue({
      id: "inv-1",
    });

    await service.inviteMember({ email: "new@test.com", role: "member" });

    expect(mocks.requireRole).toHaveBeenCalledWith(["owner", "admin"]);
  });

  it("rejects a plain member with a forbidden TeamServiceError", async () => {
    mocks.requireRole.mockRejectedValue(new Error("Insufficient permissions"));
    const service = createTeamService();

    const err = await service
      .inviteMember({ email: "new@test.com", role: "member" })
      .catch((e) => e);

    expect(isTeamServiceError(err)).toBe(true);
    expect(err.code).toBe("forbidden");
    expect(mocks.orgApi["/organization/invite-member"]).not.toHaveBeenCalled();
  });

  it("is unlimited when no checkMemberLimit port is bound", async () => {
    const service = createTeamService(); // no ports
    mocks.orgApi["/organization/invite-member"].mockResolvedValue({
      id: "inv-1",
    });

    const result = await service.inviteMember({
      email: "new@test.com",
      role: "member",
    });

    expect(result).toEqual({ id: "inv-1" });
    expect(mocks.orgApi["/organization/invite-member"]).toHaveBeenCalled();
  });

  it("enforces the member limit when the port disallows", async () => {
    const checkMemberLimit = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 2,
    });
    const service = createTeamService({ checkMemberLimit });

    const err = await service
      .inviteMember({ email: "new@test.com", role: "member" })
      .catch((e) => e);

    expect(isTeamServiceError(err)).toBe(true);
    expect(err.code).toBe("member_limit_reached");
    expect(err.meta).toEqual({ limit: 2 });
    expect(mocks.orgApi["/organization/invite-member"]).not.toHaveBeenCalled();
  });

  it("proceeds when the limit port allows", async () => {
    const checkMemberLimit = vi.fn().mockResolvedValue({
      allowed: true,
      limit: 5,
    });
    const service = createTeamService({ checkMemberLimit });
    mocks.orgApi["/organization/invite-member"].mockResolvedValue({
      id: "inv-2",
    });

    const result = await service.inviteMember({
      email: "new@test.com",
      role: "member",
    });

    expect(checkMemberLimit).toHaveBeenCalledWith("ws-1", 1);
    expect(result).toEqual({ id: "inv-2" });
  });

  it("throws invalid_input for a bad email and never calls orgApi", async () => {
    const service = createTeamService();

    const err = await service
      .inviteMember({ email: "not-an-email", role: "member" })
      .catch((e) => e);

    expect(isTeamServiceError(err)).toBe(true);
    expect(err.code).toBe("invalid_input");
    expect(mocks.orgApi["/organization/invite-member"]).not.toHaveBeenCalled();
  });

  it("does not send an email when no sendInvitationEmail port is bound (Better-Auth's org-plugin hook already sends it)", async () => {
    const service = createTeamService(); // no ports at all
    mocks.orgApi["/organization/invite-member"].mockResolvedValue({
      id: "inv-1",
    });

    await expect(
      service.inviteMember({ email: "new@test.com", role: "member" })
    ).resolves.toBeTruthy();
    // Nothing to assert on directly — the point is this does not throw
    // and calls no email port. A real composition root leaves this
    // port unbound for exactly this reason; see the module doc comment.
  });

  it("calls sendInvitationEmail when the port IS explicitly bound (opt-in, for a consumer that disables the org-plugin hook)", async () => {
    const sendInvitationEmail = vi.fn().mockResolvedValue(undefined);
    const service = createTeamService({ sendInvitationEmail });
    mocks.orgApi["/organization/invite-member"].mockResolvedValue({
      id: "inv-1",
    });

    await service.inviteMember({ email: "new@test.com", role: "member" });

    expect(sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "new@test.com",
        inviterName: "User One",
        workspaceName: "Acme",
        invitationId: "inv-1",
        role: "member",
      })
    );
  });

  it("logs but does not fail inviteMember when the bound sendInvitationEmail port rejects", async () => {
    const sendInvitationEmail = vi
      .fn()
      .mockRejectedValue(new Error("smtp down"));
    const service = createTeamService({ sendInvitationEmail });
    mocks.orgApi["/organization/invite-member"].mockResolvedValue({
      id: "inv-1",
    });

    await expect(
      service.inviteMember({ email: "new@test.com", role: "member" })
    ).resolves.toEqual({ id: "inv-1" });
  });

  it("wraps an org-api failure as provider_error", async () => {
    mocks.orgApi["/organization/invite-member"].mockRejectedValue(
      new Error("USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION")
    );
    const service = createTeamService();

    const err = await service
      .inviteMember({ email: "new@test.com", role: "member" })
      .catch((e) => e);

    expect(isTeamServiceError(err)).toBe(true);
    expect(err.code).toBe("provider_error");
  });
});

// ---------------------------------------------------------------------------
// acceptInvitation
// ---------------------------------------------------------------------------

describe("acceptInvitation", () => {
  it("accepts and notifies via the port, fire-and-forget", async () => {
    mocks.getSession.mockResolvedValue({
      session: {},
      user: { name: "Newbie", email: "n@test.com" },
    });
    mocks.getFullOrganization.mockResolvedValue({
      id: "ws-1",
      name: "Acme",
      members: [
        { userId: "owner-1", role: "owner" },
        { userId: "u-1", role: "member" },
      ],
    });
    const notifyMemberJoined = vi.fn().mockResolvedValue(undefined);
    const service = createTeamService({ notifyMemberJoined });

    await service.acceptInvitation("inv-1");

    // notifyMemberJoined is invoked but not necessarily awaited by the
    // caller; give the fire-and-forget promise a tick.
    await new Promise((r) => setTimeout(r, 0));
    expect(notifyMemberJoined).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        ownerId: "owner-1",
        memberEmail: "n@test.com",
      })
    );
  });

  it("rejects with invitation_not_found when the id is not in the caller's pending list", async () => {
    mocks.orgApi["/organization/list-user-invitations"].mockResolvedValue([
      { id: "some-other-inv", organizationId: "ws-1" },
    ]);
    const service = createTeamService();

    const err = await service.acceptInvitation("inv-1").catch((e) => e);

    expect(isTeamServiceError(err)).toBe(true);
    expect(err.code).toBe("invitation_not_found");
    expect(
      mocks.orgApi["/organization/accept-invitation"]
    ).not.toHaveBeenCalled();
  });

  it("rejects with accept_verification_failed when the post-check membership is missing", async () => {
    // Passes the pre-check (inv-1 is pending) but the post-accept
    // membership lookup does not include the caller.
    mocks.getFullOrganization.mockResolvedValue({
      id: "ws-1",
      members: [{ userId: "someone-else", role: "member" }],
    });
    const service = createTeamService();

    const err = await service.acceptInvitation("inv-1").catch((e) => e);

    expect(isTeamServiceError(err)).toBe(true);
    expect(err.code).toBe("accept_verification_failed");
  });

  it("still succeeds when the notify port throws (non-blocking)", async () => {
    mocks.getSession.mockRejectedValue(new Error("boom"));
    const service = createTeamService({
      notifyMemberJoined: vi.fn().mockRejectedValue(new Error("boom")),
    });

    await expect(service.acceptInvitation("inv-1")).resolves.toBeUndefined();
  });

  it("still succeeds when there is no notifyMemberJoined port bound", async () => {
    const service = createTeamService();

    await expect(service.acceptInvitation("inv-1")).resolves.toBeUndefined();
  });

  it("wraps an accept-invitation API failure as provider_error", async () => {
    mocks.orgApi["/organization/accept-invitation"].mockRejectedValue(
      new Error("boom")
    );
    const service = createTeamService();

    const err = await service.acceptInvitation("inv-1").catch((e) => e);

    expect(isTeamServiceError(err)).toBe(true);
    expect(err.code).toBe("provider_error");
  });

  it("throws invalid_input for an empty invitation id", async () => {
    const service = createTeamService();

    const err = await service.acceptInvitation("").catch((e) => e);

    expect(isTeamServiceError(err)).toBe(true);
    expect(err.code).toBe("invalid_input");
  });
});

// ---------------------------------------------------------------------------
// rejectInvitation + cancelInvitation
// ---------------------------------------------------------------------------

describe("rejectInvitation + cancelInvitation", () => {
  it("rejectInvitation happy path", async () => {
    const service = createTeamService();

    await expect(service.rejectInvitation("inv-1")).resolves.toBeUndefined();
    expect(mocks.orgApi["/organization/reject-invitation"]).toHaveBeenCalled();
  });

  it("rejectInvitation rejects unknown invitation ids", async () => {
    mocks.orgApi["/organization/list-user-invitations"].mockResolvedValue([]);
    const service = createTeamService();

    const err = await service.rejectInvitation("inv-1").catch((e) => e);

    expect(err.code).toBe("invitation_not_found");
  });

  it("cancelInvitation requires owner/admin", async () => {
    const service = createTeamService();

    await service.cancelInvitation("inv-1");

    expect(mocks.requireRole).toHaveBeenCalledWith(["owner", "admin"]);
  });

  it("cancelInvitation propagates role-check failure as forbidden", async () => {
    mocks.requireRole.mockRejectedValue(new Error("Insufficient permissions"));
    const service = createTeamService();

    const err = await service.cancelInvitation("inv-1").catch((e) => e);

    expect(err.code).toBe("forbidden");
  });
});

// ---------------------------------------------------------------------------
// removeMember + updateMemberRole
// ---------------------------------------------------------------------------

describe("removeMember + updateMemberRole", () => {
  it("removeMember requires owner/admin", async () => {
    const service = createTeamService();

    await service.removeMember("mem-1");

    expect(mocks.requireRole).toHaveBeenCalledWith(["owner", "admin"]);
  });

  it("removeMember is forbidden for a plain member", async () => {
    mocks.requireRole.mockRejectedValue(new Error("Insufficient permissions"));
    const service = createTeamService();

    const err = await service.removeMember("mem-1").catch((e) => e);

    expect(err.code).toBe("forbidden");
  });

  it("updateMemberRole validates body before calling orgApi", async () => {
    const service = createTeamService();

    await service.updateMemberRole({ memberId: "mem-1", role: "admin" });

    expect(
      mocks.orgApi["/organization/update-member-role"]
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ memberId: "mem-1", role: "admin" }),
      })
    );
  });

  it("updateMemberRole rejects an invalid role as invalid_input", async () => {
    const service = createTeamService();

    const err = await service
      .updateMemberRole({
        memberId: "mem-1",
        role: "not-a-role" as unknown as "admin",
      })
      .catch((e) => e);

    expect(isTeamServiceError(err)).toBe(true);
    expect(err.code).toBe("invalid_input");
  });
});

// ---------------------------------------------------------------------------
// leaveWorkspace
// ---------------------------------------------------------------------------

describe("leaveWorkspace", () => {
  it("blocks the sole owner from leaving", async () => {
    mocks.requireWorkspace.mockResolvedValue({
      ...baseCtx,
      membership: { role: "owner" },
    });
    mocks.getFullOrganization.mockResolvedValue({
      members: [{ userId: "u-1", role: "owner" }],
    });
    const service = createTeamService();

    const err = await service.leaveWorkspace().catch((e) => e);

    expect(isTeamServiceError(err)).toBe(true);
    expect(err.code).toBe("sole_owner");
    expect(mocks.orgApi["/organization/leave"]).not.toHaveBeenCalled();
  });

  it("allows leaving when another owner exists and switches active workspace", async () => {
    mocks.requireWorkspace.mockResolvedValue({
      ...baseCtx,
      membership: { role: "owner" },
    });
    mocks.getFullOrganization.mockResolvedValue({
      members: [
        { userId: "u-1", role: "owner" },
        { userId: "u-2", role: "owner" },
      ],
    });
    mocks.orgApi["/organization/list"].mockResolvedValue([{ id: "ws-2" }]);
    const service = createTeamService();

    await service.leaveWorkspace();

    expect(mocks.orgApi["/organization/leave"]).toHaveBeenCalled();
    expect(mocks.orgApi["/organization/set-active"]).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: "ws-2" } })
    );
  });

  it("skips set-active when no other workspace exists after leaving", async () => {
    mocks.requireWorkspace.mockResolvedValue({
      ...baseCtx,
      membership: { role: "member" },
    });
    mocks.orgApi["/organization/list"].mockResolvedValue([]);
    const service = createTeamService();

    await service.leaveWorkspace();

    expect(mocks.orgApi["/organization/set-active"]).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// transferOwnership
// ---------------------------------------------------------------------------

describe("transferOwnership", () => {
  it("requires owner and promotes the target", async () => {
    const service = createTeamService();

    await service.transferOwnership("mem-2");

    expect(mocks.requireRole).toHaveBeenCalledWith(["owner"]);
    expect(
      mocks.orgApi["/organization/update-member-role"]
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ memberId: "mem-2", role: "owner" }),
      })
    );
  });

  it("is forbidden for a non-owner (admin included)", async () => {
    mocks.requireRole.mockRejectedValue(new Error("Insufficient permissions"));
    const service = createTeamService();

    const err = await service.transferOwnership("mem-2").catch((e) => e);

    expect(isTeamServiceError(err)).toBe(true);
    expect(err.code).toBe("forbidden");
  });
});

// ---------------------------------------------------------------------------
// getUserInvitations
// ---------------------------------------------------------------------------

describe("getUserInvitations", () => {
  it("returns the list from the org plugin", async () => {
    mocks.orgApi["/organization/list-user-invitations"].mockResolvedValue([
      { id: "inv-1" },
    ]);
    const service = createTeamService();

    const result = await service.getUserInvitations();

    expect(result).toHaveLength(1);
  });

  it("wraps a provider failure as provider_error", async () => {
    mocks.orgApi["/organization/list-user-invitations"].mockRejectedValue(
      new Error("boom")
    );
    const service = createTeamService();

    const err = await service.getUserInvitations().catch((e) => e);

    expect(isTeamServiceError(err)).toBe(true);
    expect(err.code).toBe("provider_error");
  });
});
