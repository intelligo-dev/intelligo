import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above the static imports, so any shared spy its
// factories reference must be created inside vi.hoisted. Inlining vi.fn()
// in each factory would give every test a fresh spy and break the
// `toHaveBeenCalled()` assertions below.
const {
  headersMock,
  getSessionMock,
  getFullOrganizationMock,
  listOrganizationsMock,
  updateSetMock,
} = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers()),
  getSessionMock: vi.fn(),
  getFullOrganizationMock: vi.fn(),
  listOrganizationsMock: vi.fn(),
  updateSetMock: vi.fn(),
}));

vi.mock("@intelligo-dev/core/request-context", () => ({
  getRequestHeaders: headersMock,
}));

vi.mock("@intelligo-dev/core/db", () => ({
  db: {
    update: () => ({
      set: (values: unknown) => ({
        where: async (...args: unknown[]) => updateSetMock(values, ...args),
      }),
    }),
  },
}));

vi.mock("@intelligo-dev/core/db/schema", () => ({
  users: { id: "id", role: "role" },
}));

vi.mock("./server", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
      getFullOrganization: getFullOrganizationMock,
      listOrganizations: listOrganizationsMock,
    },
  },
}));

import {
  getAuthSession,
  requireAuth,
  getWorkspaceContext,
  getWorkspaceContextById,
  requireWorkspace,
  requireRole,
  requirePlatformAdmin,
} from "./helpers";
import { isAuthGuardError } from "./guard-error";

const userFixture = {
  id: "user_1",
  email: "u@example.com",
  emailVerified: true,
} as unknown as {
  id: string;
  email: string;
};
const sessionFixture = {
  id: "sess_1",
  userId: "user_1",
  activeOrganizationId: "org_1",
};

const orgFixture = {
  id: "org_1",
  name: "Acme",
  slug: "acme",
  logo: null,
  members: [{ id: "mem_1", userId: "user_1", role: "owner" }],
};

beforeEach(() => {
  getSessionMock.mockReset();
  getFullOrganizationMock.mockReset();
  listOrganizationsMock.mockReset();
  headersMock.mockClear();
});

describe("getAuthSession", () => {
  it("returns session + user when Better-Auth yields a session", async () => {
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });

    const result = await getAuthSession();

    expect(result).toEqual({ session: sessionFixture, user: userFixture });
  });

  it("returns null when Better-Auth returns undefined", async () => {
    getSessionMock.mockResolvedValue(undefined);

    const result = await getAuthSession();

    expect(result).toBeNull();
  });

  it("returns null when session exists but user is missing", async () => {
    getSessionMock.mockResolvedValue({ session: sessionFixture, user: null });

    const result = await getAuthSession();

    expect(result).toBeNull();
  });
});

describe("requireAuth", () => {
  it("passes through the session when authenticated", async () => {
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });

    const result = await requireAuth();

    expect(result.user).toEqual(userFixture);
  });

  it("throws Unauthorized when no session", async () => {
    getSessionMock.mockResolvedValue(null);

    await expect(requireAuth()).rejects.toThrow("Unauthorized");
  });

  it("types the failure as unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);

    const error = await requireAuth().catch((e: unknown) => e);

    expect(isAuthGuardError(error)).toBe(true);
    expect(error).toMatchObject({ code: "unauthenticated" });
  });
});

describe("getWorkspaceContext", () => {
  it("returns workspace + membership when active org and membership exist", async () => {
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });
    getFullOrganizationMock.mockResolvedValue(orgFixture);

    const result = await getWorkspaceContext();

    expect(result).not.toBeNull();
    expect(result!.workspace.id).toBe("org_1");
    expect(result!.membership.role).toBe("owner");
  });

  it("reads the active organization by its explicit id, never the implicit one", async () => {
    getSessionMock.mockResolvedValue({
      session: { ...sessionFixture, activeOrganizationId: "org_active" },
      user: userFixture,
    });
    getFullOrganizationMock.mockResolvedValue({
      ...orgFixture,
      id: "org_active",
    });

    await getWorkspaceContext();

    expect(getFullOrganizationMock).toHaveBeenCalledTimes(1);
    expect(getFullOrganizationMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: { organizationId: "org_active" } })
    );
  });

  it("goes straight to the user's workspaces when the session names no active organization", async () => {
    getSessionMock.mockResolvedValue({
      session: { ...sessionFixture, activeOrganizationId: null },
      user: userFixture,
    });
    listOrganizationsMock.mockResolvedValue([{ id: "org_1" }]);
    getFullOrganizationMock.mockResolvedValue(orgFixture);

    const result = await getWorkspaceContext();

    expect(getFullOrganizationMock).toHaveBeenCalledTimes(1);
    expect(getFullOrganizationMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: { organizationId: "org_1" } })
    );
    expect(result!.workspace.id).toBe("org_1");
  });

  it("falls back to the first workspace when the active organization no longer admits the user", async () => {
    getSessionMock.mockResolvedValue({
      session: { ...sessionFixture, activeOrganizationId: "org_removed" },
      user: userFixture,
    });
    getFullOrganizationMock.mockRejectedValueOnce(new Error("FORBIDDEN"));
    listOrganizationsMock.mockResolvedValue([{ id: "org_1" }]);
    getFullOrganizationMock.mockResolvedValueOnce(orgFixture);

    const result = await getWorkspaceContext();

    expect(result!.workspace.id).toBe("org_1");
  });

  it("auto-selects first workspace when no active org set", async () => {
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });
    getFullOrganizationMock.mockResolvedValueOnce(null); // no active org
    listOrganizationsMock.mockResolvedValue([{ id: "org_1" }]);
    getFullOrganizationMock.mockResolvedValueOnce(orgFixture); // fallback lookup by id

    const result = await getWorkspaceContext();

    expect(listOrganizationsMock).toHaveBeenCalled();
    expect(result!.workspace.id).toBe("org_1");
  });

  it("returns null when user has no workspaces at all", async () => {
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });
    getFullOrganizationMock.mockResolvedValueOnce(null);
    listOrganizationsMock.mockResolvedValue([]);

    const result = await getWorkspaceContext();

    expect(result).toBeNull();
  });

  it("returns null when user is not a member of the active org", async () => {
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });
    getFullOrganizationMock.mockResolvedValue({
      ...orgFixture,
      members: [{ id: "mem_other", userId: "someone_else", role: "owner" }],
    });

    const result = await getWorkspaceContext();

    expect(result).toBeNull();
  });

  it("returns null when session is missing", async () => {
    getSessionMock.mockResolvedValue(null);

    const result = await getWorkspaceContext();

    expect(result).toBeNull();
    expect(getFullOrganizationMock).not.toHaveBeenCalled();
  });
});

describe("getWorkspaceContextById", () => {
  it("fetches org by id and returns context when user is a member", async () => {
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });
    getFullOrganizationMock.mockResolvedValue(orgFixture);

    const result = await getWorkspaceContextById("org_1");

    expect(getFullOrganizationMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: { organizationId: "org_1" } })
    );
    expect(result!.workspace.id).toBe("org_1");
    expect(result!.membership.role).toBe("owner");
  });

  it("returns null when the org lookup misses", async () => {
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });
    getFullOrganizationMock.mockResolvedValue(null);

    const result = await getWorkspaceContextById("org_missing");

    expect(result).toBeNull();
  });

  it("returns null when user is not a member of the requested org", async () => {
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });
    getFullOrganizationMock.mockResolvedValue({
      ...orgFixture,
      members: [{ id: "mem_other", userId: "someone_else", role: "admin" }],
    });

    const result = await getWorkspaceContextById("org_1");

    expect(result).toBeNull();
  });
});

describe("requireWorkspace", () => {
  it("returns context when workspace is active", async () => {
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });
    getFullOrganizationMock.mockResolvedValue(orgFixture);

    const result = await requireWorkspace();

    expect(result.workspace.id).toBe("org_1");
  });

  it("throws when no workspace is active", async () => {
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });
    getFullOrganizationMock.mockResolvedValue(null);
    listOrganizationsMock.mockResolvedValue([]);

    await expect(requireWorkspace()).rejects.toThrow("No active workspace");
  });

  it("types a signed-in user with no workspace as no_workspace", async () => {
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });
    getFullOrganizationMock.mockResolvedValue(null);
    listOrganizationsMock.mockResolvedValue([]);

    const error = await requireWorkspace().catch((e: unknown) => e);

    expect(isAuthGuardError(error)).toBe(true);
    expect(error).toMatchObject({ code: "no_workspace" });
  });

  it("throws unauthenticated, not no_workspace, when there is no session", async () => {
    getSessionMock.mockResolvedValue(null);

    const error = await requireWorkspace().catch((e: unknown) => e);

    expect(error).toMatchObject({
      code: "unauthenticated",
      message: "Unauthorized",
    });
    expect(getFullOrganizationMock).not.toHaveBeenCalled();
  });
});

describe("requireRole", () => {
  it("returns context when user's role is in the allowed set", async () => {
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });
    getFullOrganizationMock.mockResolvedValue(orgFixture);

    const result = await requireRole(["owner", "admin"]);

    expect(result.membership.role).toBe("owner");
  });

  it("throws Insufficient permissions when role is not allowed", async () => {
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });
    getFullOrganizationMock.mockResolvedValue({
      ...orgFixture,
      members: [{ id: "mem_1", userId: "user_1", role: "member" }],
    });

    await expect(requireRole(["owner", "admin"])).rejects.toThrow(
      "Insufficient permissions"
    );
  });

  it("bubbles up requireWorkspace failure when no workspace is active", async () => {
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });
    getFullOrganizationMock.mockResolvedValue(null);
    listOrganizationsMock.mockResolvedValue([]);

    await expect(requireRole(["owner"])).rejects.toThrow("No active workspace");
  });

  it("tells a missing role (forbidden) from a missing session (unauthenticated)", async () => {
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });
    getFullOrganizationMock.mockResolvedValue({
      ...orgFixture,
      members: [{ id: "mem_1", userId: "user_1", role: "member" }],
    });
    await expect(requireRole(["owner"])).rejects.toMatchObject({
      code: "forbidden",
    });

    getSessionMock.mockResolvedValue(null);
    await expect(requireRole(["owner"])).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
});

describe("requirePlatformAdmin", () => {
  // Platform admin is deliberately NOT the workspace `owner` role: any
  // user who creates a workspace owns it.
  beforeEach(() => {
    vi.unstubAllEnvs();
    updateSetMock.mockReset();
  });

  it("passes when the user's email is on the allowlist", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "admin@example.com, u@example.com");
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });

    await expect(requirePlatformAdmin()).resolves.toEqual({
      session: sessionFixture,
      user: userFixture,
    });
  });

  it("matches case-insensitively", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "U@Example.COM");
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });

    await expect(requirePlatformAdmin()).resolves.toBeTruthy();
  });

  it("promotes an allowlisted user into users.role on first use", async () => {
    // The env var is the bootstrap; the row is what every other check
    // reads — including Better-Auth's admin plugin, which cannot see
    // the environment at all.
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "u@example.com");
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });

    await requirePlatformAdmin();

    expect(updateSetMock).toHaveBeenCalledWith(
      { role: "platform-admin" },
      expect.anything()
    );
  });

  it("does not honour the allowlist for an address that is not verified", async () => {
    // Whoever registers the allowlisted address first would otherwise
    // be an admin.
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "u@example.com");
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: { ...userFixture, emailVerified: false },
    });

    await expect(requirePlatformAdmin()).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it("admits a user who has the role but is not on the allowlist", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "someone-else@example.com");
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: { ...userFixture, role: "platform-admin" },
    });

    await expect(requirePlatformAdmin()).resolves.toBeTruthy();
    // Already promoted — nothing to write.
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it("still admits when the promotion write fails", async () => {
    // A logging or write failure must not lock an admin out mid-incident;
    // the allowlist already authorized them.
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "u@example.com");
    updateSetMock.mockRejectedValueOnce(new Error("db down"));
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });

    await expect(requirePlatformAdmin()).resolves.toBeTruthy();
  });

  it("rejects a workspace owner who is not on the allowlist", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "someone-else@example.com");
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });

    await expect(requirePlatformAdmin()).rejects.toThrow(
      "Insufficient permissions"
    );
  });

  it("is closed by default when no allowlist is configured", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "");
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });

    await expect(requirePlatformAdmin()).rejects.toThrow(
      "Insufficient permissions"
    );
  });

  it("requires authentication first", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "u@example.com");
    getSessionMock.mockResolvedValue(null);

    await expect(requirePlatformAdmin()).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("types a signed-in non-admin as forbidden", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "");
    getSessionMock.mockResolvedValue({
      session: sessionFixture,
      user: userFixture,
    });

    await expect(requirePlatformAdmin()).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
