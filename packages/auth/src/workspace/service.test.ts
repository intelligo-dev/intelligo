/**
 * Mocks `../helpers` (requireAuth/requireWorkspace/requireRole),
 * `../server` (auth.api.createOrganization/updateOrganization/
 * deleteOrganization/getFullOrganization), and `../org-api` (orgApi's
 * `/organization/list` and `/organization/set-active`).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above the file's static imports, so
// anything they reference must be born inside vi.hoisted (see
// ../team/service.test.ts for the same note).
const mocks = vi.hoisted(() => {
  const requireAuth = vi.fn();
  const requireRole = vi.fn();
  const requireWorkspace = vi.fn();
  const headersMock = vi.fn(async () => new Headers());

  const createOrganization = vi.fn();
  const updateOrganization = vi.fn();
  const deleteOrganization = vi.fn();
  const getFullOrganization = vi.fn();

  const orgApi = {
    "/organization/list": vi.fn(),
    "/organization/set-active": vi.fn(),
  };

  return {
    requireAuth,
    requireRole,
    requireWorkspace,
    headersMock,
    createOrganization,
    updateOrganization,
    deleteOrganization,
    getFullOrganization,
    orgApi,
  };
});

vi.mock("@intelligo-dev/core/request-context", () => ({
  getRequestHeaders: mocks.headersMock,
}));

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
      createOrganization: mocks.createOrganization,
      updateOrganization: mocks.updateOrganization,
      deleteOrganization: mocks.deleteOrganization,
      getFullOrganization: mocks.getFullOrganization,
    },
  },
}));

vi.mock("../org-api", () => ({
  orgApi: mocks.orgApi,
}));

import { createWorkspaceService } from "./service";
import { isWorkspaceServiceError } from "./errors";

const baseCtx = {
  workspace: { id: "ws-1", name: "Acme", slug: "acme" },
  user: { id: "u-1", name: "User One", email: "u@example.com" },
  membership: { role: "owner" },
};

beforeEach(() => {
  vi.resetAllMocks();

  mocks.headersMock.mockImplementation(async () => new Headers());
  mocks.requireAuth.mockResolvedValue(baseCtx);
  mocks.requireWorkspace.mockResolvedValue(baseCtx);
  mocks.requireRole.mockResolvedValue(baseCtx);

  mocks.orgApi["/organization/list"].mockResolvedValue([]);
  mocks.orgApi["/organization/set-active"].mockResolvedValue({});
  mocks.createOrganization.mockResolvedValue({
    id: "ws-new",
    name: "New Co",
    slug: "new-co-abc123",
  });
  mocks.updateOrganization.mockResolvedValue({
    id: "ws-1",
    name: "Acme",
    slug: "acme",
  });
  mocks.deleteOrganization.mockResolvedValue({ success: true });
  mocks.getFullOrganization.mockResolvedValue({
    id: "ws-1",
    name: "Acme",
    slug: "acme",
  });
});

describe("listWorkspaces", () => {
  it("returns the caller's workspaces", async () => {
    mocks.orgApi["/organization/list"].mockResolvedValue([
      { id: "ws-1", name: "Acme" },
      { id: "ws-2", name: "Beta" },
    ]);
    const service = createWorkspaceService();

    expect(await service.listWorkspaces()).toHaveLength(2);
  });

  it("returns an empty array when the provider returns null", async () => {
    mocks.orgApi["/organization/list"].mockResolvedValue(null);
    const service = createWorkspaceService();

    expect(await service.listWorkspaces()).toEqual([]);
  });

  it("throws a forbidden WorkspaceServiceError when unauthenticated", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("Unauthorized"));
    const service = createWorkspaceService();

    const err = await service.listWorkspaces().catch((e) => e);

    expect(isWorkspaceServiceError(err)).toBe(true);
    expect(err.code).toBe("forbidden");
  });
});

describe("createWorkspace", () => {
  it("auto-generates a unique slug from the name when none is given", async () => {
    const service = createWorkspaceService();

    await service.createWorkspace({ name: "Acme Corp" });

    const body = mocks.createOrganization.mock.calls[0]![0].body;
    expect(body.name).toBe("Acme Corp");
    expect(body.slug).toMatch(/^acme-corp-[a-z0-9]+$/);
  });

  it("appends a uniqueness suffix even when a slug is provided", async () => {
    const service = createWorkspaceService();

    await service.createWorkspace({ name: "Acme Corp", slug: "acme" });

    const body = mocks.createOrganization.mock.calls[0]![0].body;
    expect(body.slug).toMatch(/^acme-[a-z0-9]+$/);
  });

  it("auto-activates the new workspace", async () => {
    const service = createWorkspaceService();

    const result = await service.createWorkspace({ name: "New Co" });

    expect(result).toEqual({
      id: "ws-new",
      name: "New Co",
      slug: "new-co-abc123",
    });
    expect(mocks.orgApi["/organization/set-active"]).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { organizationId: "ws-new" },
      })
    );
  });

  it("is unlimited when no checkWorkspaceLimit port is bound, even with existing workspaces", async () => {
    mocks.orgApi["/organization/list"].mockResolvedValue([
      { id: "ws-1", name: "Acme" },
    ]);
    const service = createWorkspaceService(); // no ports

    await expect(
      service.createWorkspace({ name: "Second Co" })
    ).resolves.toBeTruthy();
    expect(mocks.createOrganization).toHaveBeenCalled();
  });

  it("skips the limit check for the caller's first workspace even when the port is bound", async () => {
    mocks.orgApi["/organization/list"].mockResolvedValue([]);
    const checkWorkspaceLimit = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 0,
    });
    const service = createWorkspaceService({ checkWorkspaceLimit });

    await expect(
      service.createWorkspace({ name: "First Co" })
    ).resolves.toBeTruthy();
    expect(checkWorkspaceLimit).not.toHaveBeenCalled();
  });

  it("enforces the workspace limit when the port disallows (existing workspaces present)", async () => {
    mocks.orgApi["/organization/list"].mockResolvedValue([
      { id: "ws-1", name: "Acme" },
    ]);
    const checkWorkspaceLimit = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 1,
    });
    const service = createWorkspaceService({ checkWorkspaceLimit });

    const err = await service
      .createWorkspace({ name: "Second Co" })
      .catch((e) => e);

    expect(isWorkspaceServiceError(err)).toBe(true);
    expect(err.code).toBe("workspace_limit_reached");
    expect(err.meta).toEqual({ limit: 1 });
    expect(mocks.createOrganization).not.toHaveBeenCalled();
  });

  it("proceeds when the limit port allows, passing userId and current count", async () => {
    mocks.orgApi["/organization/list"].mockResolvedValue([
      { id: "ws-1", name: "Acme" },
    ]);
    const checkWorkspaceLimit = vi.fn().mockResolvedValue({
      allowed: true,
      limit: 5,
    });
    const service = createWorkspaceService({ checkWorkspaceLimit });

    await service.createWorkspace({ name: "Second Co" });

    expect(checkWorkspaceLimit).toHaveBeenCalledWith("u-1", 1);
    expect(mocks.createOrganization).toHaveBeenCalled();
  });

  it("throws invalid_input for a too-short name and never calls the provider", async () => {
    const service = createWorkspaceService();

    const err = await service.createWorkspace({ name: "A" }).catch((e) => e);

    expect(isWorkspaceServiceError(err)).toBe(true);
    expect(err.code).toBe("invalid_input");
    expect(mocks.createOrganization).not.toHaveBeenCalled();
  });

  it("wraps a provider failure as provider_error", async () => {
    mocks.createOrganization.mockRejectedValue(new Error("boom"));
    const service = createWorkspaceService();

    const err = await service
      .createWorkspace({ name: "New Co" })
      .catch((e) => e);

    expect(isWorkspaceServiceError(err)).toBe(true);
    expect(err.code).toBe("provider_error");
  });

  it("throws provider_error when the provider returns null", async () => {
    mocks.createOrganization.mockResolvedValue(null);
    const service = createWorkspaceService();

    const err = await service
      .createWorkspace({ name: "New Co" })
      .catch((e) => e);

    expect(isWorkspaceServiceError(err)).toBe(true);
    expect(err.code).toBe("provider_error");
  });
});

describe("switchWorkspace", () => {
  it("sets the active organization", async () => {
    const service = createWorkspaceService();

    await service.switchWorkspace("ws-2");

    expect(mocks.orgApi["/organization/set-active"]).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: "ws-2" } })
    );
  });

  it("throws invalid_input for an empty id", async () => {
    const service = createWorkspaceService();

    const err = await service.switchWorkspace("").catch((e) => e);

    expect(isWorkspaceServiceError(err)).toBe(true);
    expect(err.code).toBe("invalid_input");
    expect(mocks.orgApi["/organization/set-active"]).not.toHaveBeenCalled();
  });

  it("throws forbidden when unauthenticated", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("Unauthorized"));
    const service = createWorkspaceService();

    const err = await service.switchWorkspace("ws-2").catch((e) => e);

    expect(err.code).toBe("forbidden");
  });
});

describe("updateWorkspace", () => {
  it("requires owner/admin", async () => {
    const service = createWorkspaceService();

    await service.updateWorkspace({ name: "Renamed" });

    expect(mocks.requireRole).toHaveBeenCalledWith(["owner", "admin"]);
  });

  it("rejects a plain member with a forbidden WorkspaceServiceError", async () => {
    mocks.requireRole.mockRejectedValue(new Error("Insufficient permissions"));
    const service = createWorkspaceService();

    const err = await service
      .updateWorkspace({ name: "Renamed" })
      .catch((e) => e);

    expect(isWorkspaceServiceError(err)).toBe(true);
    expect(err.code).toBe("forbidden");
    expect(mocks.updateOrganization).not.toHaveBeenCalled();
  });

  it("only sends the fields that were provided", async () => {
    const service = createWorkspaceService();

    await service.updateWorkspace({ name: "Renamed" });

    expect(mocks.updateOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { data: { name: "Renamed" }, organizationId: "ws-1" },
      })
    );
  });

  it("throws invalid_input for a bad slug", async () => {
    const service = createWorkspaceService();

    const err = await service
      .updateWorkspace({ slug: "Not A Slug!" })
      .catch((e) => e);

    expect(isWorkspaceServiceError(err)).toBe(true);
    expect(err.code).toBe("invalid_input");
    expect(mocks.updateOrganization).not.toHaveBeenCalled();
  });

  it("wraps a provider failure as provider_error", async () => {
    mocks.updateOrganization.mockRejectedValue(new Error("boom"));
    const service = createWorkspaceService();

    const err = await service
      .updateWorkspace({ name: "Renamed" })
      .catch((e) => e);

    expect(isWorkspaceServiceError(err)).toBe(true);
    expect(err.code).toBe("provider_error");
  });
});

describe("deleteWorkspace", () => {
  it("requires owner", async () => {
    const service = createWorkspaceService();

    await service.deleteWorkspace();

    expect(mocks.requireRole).toHaveBeenCalledWith(["owner"]);
  });

  it("rejects an admin (owner-only) with forbidden", async () => {
    mocks.requireRole.mockRejectedValue(new Error("Insufficient permissions"));
    const service = createWorkspaceService();

    const err = await service.deleteWorkspace().catch((e) => e);

    expect(isWorkspaceServiceError(err)).toBe(true);
    expect(err.code).toBe("forbidden");
    expect(mocks.deleteOrganization).not.toHaveBeenCalled();
  });

  it("switches to another workspace when one remains after delete", async () => {
    mocks.orgApi["/organization/list"].mockResolvedValue([
      { id: "ws-2", name: "Beta" },
    ]);
    const service = createWorkspaceService();

    await service.deleteWorkspace();

    expect(mocks.deleteOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: "ws-1" } })
    );
    expect(mocks.orgApi["/organization/set-active"]).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: "ws-2" } })
    );
  });

  it("skips set-active when no workspace remains after delete", async () => {
    mocks.orgApi["/organization/list"].mockResolvedValue([]);
    const service = createWorkspaceService();

    await service.deleteWorkspace();

    expect(mocks.orgApi["/organization/set-active"]).not.toHaveBeenCalled();
  });

  it("wraps a provider failure as provider_error", async () => {
    mocks.deleteOrganization.mockRejectedValue(new Error("boom"));
    const service = createWorkspaceService();

    const err = await service.deleteWorkspace().catch((e) => e);

    expect(isWorkspaceServiceError(err)).toBe(true);
    expect(err.code).toBe("provider_error");
  });
});

describe("getActiveWorkspace", () => {
  it("resolves the workspace via requireWorkspace with an explicit organizationId", async () => {
    const service = createWorkspaceService();

    const result = await service.getActiveWorkspace();

    expect(mocks.getFullOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ query: { organizationId: "ws-1" } })
    );
    expect(result).toEqual({ id: "ws-1", name: "Acme", slug: "acme" });
  });

  it("throws forbidden when there is no active workspace", async () => {
    mocks.requireWorkspace.mockRejectedValue(new Error("No active workspace"));
    const service = createWorkspaceService();

    const err = await service.getActiveWorkspace().catch((e) => e);

    expect(isWorkspaceServiceError(err)).toBe(true);
    expect(err.code).toBe("forbidden");
  });

  it("throws not_found when the provider returns no organization", async () => {
    mocks.getFullOrganization.mockResolvedValue(null);
    const service = createWorkspaceService();

    const err = await service.getActiveWorkspace().catch((e) => e);

    expect(isWorkspaceServiceError(err)).toBe(true);
    expect(err.code).toBe("not_found");
  });

  it("wraps a provider failure as provider_error", async () => {
    mocks.getFullOrganization.mockRejectedValue(new Error("boom"));
    const service = createWorkspaceService();

    const err = await service.getActiveWorkspace().catch((e) => e);

    expect(isWorkspaceServiceError(err)).toBe(true);
    expect(err.code).toBe("provider_error");
  });
});
