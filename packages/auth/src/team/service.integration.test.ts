/**
 * Real Postgres, real Better-Auth; runs only when DATABASE_URL is set. The
 * one mock is `getRequestHeaders()`, pointed at the `Headers` of whichever
 * user is making the call, since vitest has no request to bind.
 *
 * Fixtures are created through `auth.api.*` with `new Headers({ cookie })`.
 * `emailVerified` is set directly in the database: there is no test inbox,
 * and the invitation endpoints require a verified email.
 *
 * Needs a database prepared with `pnpm db:push`. Organizations created here
 * are deleted in `afterAll`; fixture users are left behind (no user-delete
 * endpoint is wired).
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
const d = DATABASE_URL ? describe : describe.skip;

// Real network round-trips (Neon HTTP driver, several sequential
// Better-Auth calls per test) comfortably exceed vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// The mocked request context reads this ref, pointed at the `Headers` of
// whichever user is "making the call"; the service reads it on every call.
const currentHeaders = { value: new Headers() as Headers };

vi.mock("@intelligo-dev/core/request-context", () => ({
  getRequestHeaders: async () => currentHeaders.value,
}));

function asUser(cookie: string) {
  currentHeaders.value = new Headers({ cookie });
}

d("team service — real DB integration", () => {
  // Dynamic imports, so the mock above is in place before `./service`
  // (and transitively `../server`) is imported.
  let db: typeof import("@intelligo-dev/core/db").db;
  let users: typeof import("@intelligo-dev/core/db/schema").users;
  let auth: typeof import("../server").auth;
  let createTeamService: typeof import("./service").createTeamService;
  let isTeamServiceError: typeof import("./errors").isTeamServiceError;

  type Fixture = { cookie: string; userId: string; email: string };

  async function signUpVerified(email: string, name: string): Promise<Fixture> {
    const res = await auth.api.signUpEmail({
      body: { email, password: "Password123!", name },
      asResponse: true,
    });
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) {
      throw new Error(`signUpEmail did not set a session cookie for ${email}`);
    }
    const cookie = setCookie.split(",")[0]!.split(";")[0]!;

    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    if (!session?.user)
      throw new Error(`No session after sign-up for ${email}`);

    await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, session.user.id));

    return { cookie, userId: session.user.id, email };
  }

  async function createWorkspace(owner: Fixture, name: string, slug: string) {
    const org = await auth.api.createOrganization({
      headers: new Headers({ cookie: owner.cookie }),
      body: { name, slug, userId: owner.userId },
    });
    if (!org) throw new Error(`Failed to create organization ${slug}`);
    await auth.api.setActiveOrganization({
      headers: new Headers({ cookie: owner.cookie }),
      body: { organizationId: org.id },
    });
    return org;
  }

  const suffix = Date.now();
  const createdOrgs: Array<{ orgId: string; ownerCookie: string }> = [];

  beforeAll(async () => {
    ({ db } = await import("@intelligo-dev/core/db"));
    ({ users } = await import("@intelligo-dev/core/db/schema"));
    ({ auth } = await import("../server"));
    ({ createTeamService } = await import("./service"));
    ({ isTeamServiceError } = await import("./errors"));
  });

  // Full lifecycle: invite -> pending listed -> accept -> member listed,
  // duplicate prevention, acceptance idempotency, role change, removal.
  // Deliberately one ordered sequence (each `it` depends on the last),
  // like the invitation lifecycle it exercises.
  describe("invitation lifecycle", () => {
    const service = () => createTeamService();
    let owner: Fixture;
    let member: Fixture;
    let orgId: string;
    let invitationId: string;
    let memberRecordId: string;

    beforeAll(async () => {
      owner = await signUpVerified(
        `it-owner-${suffix}@example.test`,
        "Owner IT"
      );
      const org = await createWorkspace(
        owner,
        "IT Workspace",
        `it-ws-${suffix}`
      );
      orgId = org.id;
      createdOrgs.push({ orgId, ownerCookie: owner.cookie });
    });

    it("inviteMember creates a pending invitation (owner)", async () => {
      asUser(owner.cookie);
      const invitation = await service().inviteMember({
        email: `it-member-${suffix}@example.test`,
        role: "member",
      });

      expect(invitation).toBeTruthy();
      expect(invitation!.status).toBe("pending");
      invitationId = invitation!.id;
    });

    it("listInvitations shows the pending invitation (owner)", async () => {
      asUser(owner.cookie);
      const invitations = await service().listInvitations();

      expect(invitations.some((i) => i.id === invitationId)).toBe(true);
    });

    it("inviteMember again for the same email is rejected (Better-Auth's own duplicate guard)", async () => {
      asUser(owner.cookie);
      const err = await service()
        .inviteMember({
          email: `it-member-${suffix}@example.test`,
          role: "member",
        })
        .catch((e) => e);

      expect(isTeamServiceError(err)).toBe(true);
      expect(err.code).toBe("provider_error");
    });

    it("getUserInvitations shows the invitation for the invited (not-yet-a-member) user", async () => {
      member = await signUpVerified(
        `it-member-${suffix}@example.test`,
        "Member IT"
      );

      asUser(member.cookie);
      const invitations = await service().getUserInvitations();

      expect(invitations.some((i) => i.id === invitationId)).toBe(true);
    });

    it("acceptInvitation succeeds and the member is listed", async () => {
      asUser(member.cookie);
      await expect(
        service().acceptInvitation(invitationId)
      ).resolves.toBeUndefined();

      asUser(owner.cookie);
      const members = await service().listMembers();
      const memberRow = members.find((m) => m.userId === member.userId);
      expect(memberRow).toBeTruthy();
      expect(memberRow!.role).toBe("member");
      memberRecordId = memberRow!.id!;
    });

    it("accepting the same invitation again is idempotent — rejected, not a duplicate membership", async () => {
      asUser(member.cookie);
      const err = await service()
        .acceptInvitation(invitationId)
        .catch((e) => e);

      expect(isTeamServiceError(err)).toBe(true);
      // The invitation is no longer pending, so it fails the caller's
      // own pending-list pre-check rather than reaching Better-Auth.
      expect(err.code).toBe("invitation_not_found");

      asUser(owner.cookie);
      const members = await service().listMembers();
      const matches = members.filter((m) => m.userId === member.userId);
      expect(matches).toHaveLength(1);
    });

    it("updateMemberRole promotes the member to admin (owner)", async () => {
      asUser(owner.cookie);
      await service().updateMemberRole({
        memberId: memberRecordId,
        role: "admin",
      });

      const members = await service().listMembers();
      const memberRow = members.find((m) => m.userId === member.userId);
      expect(memberRow!.role).toBe("admin");
    });

    it("removeMember removes the member (owner)", async () => {
      asUser(owner.cookie);
      await service().removeMember(memberRecordId);

      const members = await service().listMembers();
      expect(members.some((m) => m.userId === member.userId)).toBe(false);
    });
  });

  describe("leaveWorkspace — sole owner", () => {
    it("blocks the sole owner from leaving", async () => {
      const owner = await signUpVerified(
        `it-solo-owner-${suffix}@example.test`,
        "Solo Owner IT"
      );
      const org = await createWorkspace(
        owner,
        "Solo Workspace",
        `it-solo-ws-${suffix}`
      );
      createdOrgs.push({ orgId: org.id, ownerCookie: owner.cookie });

      asUser(owner.cookie);
      const err = await createTeamService()
        .leaveWorkspace()
        .catch((e) => e);

      expect(isTeamServiceError(err)).toBe(true);
      expect(err.code).toBe("sole_owner");
    });
  });

  // Workspace scoping — an invitation in workspace B must not be
  // visible from workspace A.
  describe("workspace scoping", () => {
    it("workspace B's invitation is invisible from workspace A", async () => {
      const ownerA = await signUpVerified(
        `it-scope-a-${suffix}@example.test`,
        "Owner A IT"
      );
      const orgA = await createWorkspace(
        ownerA,
        "Scope Workspace A",
        `it-scope-a-${suffix}`
      );
      createdOrgs.push({ orgId: orgA.id, ownerCookie: ownerA.cookie });

      const ownerB = await signUpVerified(
        `it-scope-b-${suffix}@example.test`,
        "Owner B IT"
      );
      const orgB = await createWorkspace(
        ownerB,
        "Scope Workspace B",
        `it-scope-b-${suffix}`
      );
      createdOrgs.push({ orgId: orgB.id, ownerCookie: ownerB.cookie });

      asUser(ownerB.cookie);
      const invitationB = await createTeamService().inviteMember({
        email: `it-scope-b-invitee-${suffix}@example.test`,
        role: "member",
      });
      expect(invitationB).toBeTruthy();

      asUser(ownerA.cookie);
      const invitationsInA = await createTeamService().listInvitations();

      expect(invitationsInA.some((i) => i.id === invitationB!.id)).toBe(false);
    });
  });

  afterAll(async () => {
    for (const { orgId: organizationId, ownerCookie } of createdOrgs) {
      try {
        await auth.api.deleteOrganization({
          headers: new Headers({ cookie: ownerCookie }),
          body: { organizationId },
        });
      } catch {
        // Best-effort cleanup: a failure here must not fail the run.
      }
    }
  });
});
