/**
 * Real Postgres, real Better-Auth; runs only when DATABASE_URL is set. The
 * bootstrap is `../team/service.integration.test.ts`'s: only the request
 * context is mocked. Needs a database prepared with `pnpm db:push`.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
const d = DATABASE_URL ? describe : describe.skip;

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const currentHeaders = { value: new Headers() as Headers };

vi.mock("@intelligo-dev/core/request-context", () => ({
  getRequestHeaders: async () => currentHeaders.value,
}));

function asUser(cookie: string) {
  currentHeaders.value = new Headers({ cookie });
}

d("workspace service — real DB integration", () => {
  let db: typeof import("@intelligo-dev/core/db").db;
  let users: typeof import("@intelligo-dev/core/db/schema").users;
  let auth: typeof import("../server").auth;
  let createWorkspaceService: typeof import("./service").createWorkspaceService;
  let isWorkspaceServiceError: typeof import("./errors").isWorkspaceServiceError;

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

  const suffix = Date.now();
  const createdOrgs: Array<{ orgId: string; ownerCookie: string }> = [];

  beforeAll(async () => {
    ({ db } = await import("@intelligo-dev/core/db"));
    ({ users } = await import("@intelligo-dev/core/db/schema"));
    ({ auth } = await import("../server"));
    ({ createWorkspaceService } = await import("./service"));
    ({ isWorkspaceServiceError } = await import("./errors"));
  });

  // Create -> auto-activate -> list -> read back -> update -> delete
  // (switches to the remaining workspace). One ordered sequence.
  describe("lifecycle", () => {
    const service = () => createWorkspaceService();
    let owner: Fixture;
    let firstOrgId: string;
    let secondOrgId: string;

    beforeAll(async () => {
      owner = await signUpVerified(
        `it-ws-owner-${suffix}@example.test`,
        "Workspace Owner IT"
      );

      // Created up front so the lifecycle below always has two
      // workspaces to work with.
      asUser(owner.cookie);
      const firstOrg = await service().createWorkspace({
        name: "IT First Workspace",
      });
      firstOrgId = firstOrg.id;
      createdOrgs.push({ orgId: firstOrgId, ownerCookie: owner.cookie });
    });

    it("createWorkspace auto-generates a unique slug and auto-activates", async () => {
      asUser(owner.cookie);
      const org = await service().createWorkspace({
        name: "IT Second Workspace",
      });

      expect(org.id).toBeTruthy();
      expect(org.slug).toMatch(/^it-second-workspace-[a-z0-9]+$/);
      secondOrgId = org.id;
      createdOrgs.push({ orgId: secondOrgId, ownerCookie: owner.cookie });

      const active = await service().getActiveWorkspace();
      expect(active.id).toBe(secondOrgId);
    });

    it("listWorkspaces returns both created workspaces", async () => {
      asUser(owner.cookie);
      const orgs = await service().listWorkspaces();

      expect(orgs.some((o) => o.id === firstOrgId)).toBe(true);
      expect(orgs.some((o) => o.id === secondOrgId)).toBe(true);
    });

    it("switchWorkspace changes which workspace getActiveWorkspace resolves", async () => {
      asUser(owner.cookie);
      await service().switchWorkspace(firstOrgId);

      const active = await service().getActiveWorkspace();
      expect(active.id).toBe(firstOrgId);
    });

    it("updateWorkspace renames the active (first) workspace", async () => {
      asUser(owner.cookie);
      const updated = await service().updateWorkspace({
        name: "IT First Workspace Renamed",
      });

      expect(updated.name).toBe("IT First Workspace Renamed");
    });

    it("deleteWorkspace removes the active workspace and switches to another", async () => {
      asUser(owner.cookie);
      await service().deleteWorkspace();

      // Deleted — remove from cleanup list so afterAll doesn't retry it.
      createdOrgs.splice(
        createdOrgs.findIndex((o) => o.orgId === firstOrgId),
        1
      );

      // Which one it switches to is not this test's business, and it is
      // not `secondOrgId` in general: signing up creates a workspace of
      // its own (the `user.create.after` hook in ../server.ts), so this
      // owner has three, and the fallback picks from what is left. What
      // must hold is that the deleted one is gone and the caller still
      // has an active workspace it belongs to.
      const remaining = await service().listWorkspaces();
      expect(remaining.some((o) => o.id === firstOrgId)).toBe(false);

      const active = await service().getActiveWorkspace();
      expect(active.id).not.toBe(firstOrgId);
      expect(remaining.some((o) => o.id === active.id)).toBe(true);
    });
  });

  describe("role gates", () => {
    it("updateWorkspace and deleteWorkspace are forbidden for a plain member", async () => {
      const owner = await signUpVerified(
        `it-ws-gate-owner-${suffix}@example.test`,
        "Gate Owner IT"
      );
      asUser(owner.cookie);
      const org = await createWorkspaceService().createWorkspace({
        name: "IT Gate Workspace",
      });
      createdOrgs.push({ orgId: org.id, ownerCookie: owner.cookie });

      const member = await signUpVerified(
        `it-ws-gate-member-${suffix}@example.test`,
        "Gate Member IT"
      );
      // Add the member directly via Better-Auth (no invitation flow
      // needed for this test — only the role gate is under test).
      await auth.api.addMember({
        body: {
          userId: member.userId,
          organizationId: org.id,
          role: "member",
        },
      });

      asUser(member.cookie);
      await auth.api.setActiveOrganization({
        headers: new Headers({ cookie: member.cookie }),
        body: { organizationId: org.id },
      });

      const updateErr = await createWorkspaceService()
        .updateWorkspace({ name: "Should Not Work" })
        .catch((e) => e);
      expect(isWorkspaceServiceError(updateErr)).toBe(true);
      expect(updateErr.code).toBe("forbidden");

      const deleteErr = await createWorkspaceService()
        .deleteWorkspace()
        .catch((e) => e);
      expect(isWorkspaceServiceError(deleteErr)).toBe(true);
      expect(deleteErr.code).toBe("forbidden");
    });
  });

  describe("checkWorkspaceLimit port", () => {
    it("blocks a second workspace when the bound port disallows", async () => {
      const owner = await signUpVerified(
        `it-ws-limit-${suffix}@example.test`,
        "Limit Owner IT"
      );
      asUser(owner.cookie);
      const firstOrg = await createWorkspaceService().createWorkspace({
        name: "IT Limit First",
      });
      createdOrgs.push({ orgId: firstOrg.id, ownerCookie: owner.cookie });

      const checkWorkspaceLimit = vi.fn().mockResolvedValue({
        allowed: false,
        limit: 1,
      });
      const service = createWorkspaceService({ checkWorkspaceLimit });

      asUser(owner.cookie);
      const err = await service
        .createWorkspace({ name: "IT Limit Second" })
        .catch((e) => e);

      expect(isWorkspaceServiceError(err)).toBe(true);
      expect(err.code).toBe("workspace_limit_reached");
      // Two, not one: signing up created a workspace through the
      // `user.create.after` hook in ../server.ts before this test made
      // "IT Limit First". The port is told the real count.
      expect(checkWorkspaceLimit).toHaveBeenCalledWith(owner.userId, 2);
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
