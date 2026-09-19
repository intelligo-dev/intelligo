/**
 * The authenticated layout calls this on every render, so a valid active
 * workspace must be kept; only a missing or stale one is replaced.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const api = vi.hoisted(() => ({
  listOrganizations: vi.fn(),
  getSession: vi.fn(),
  setActiveOrganization: vi.fn(),
  createOrganization: vi.fn(),
}));

vi.mock("./server", () => ({ auth: { api } }));
vi.mock("@intelligo-dev/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { ensureUserWorkspace } from "./workspace-init";
import {
  clearWorkspaceCreatedHandler,
  setWorkspaceCreatedHandler,
} from "./workspace-bootstrap";

const user = { id: "u1", email: "u1@example.test", name: "U" } as never;
const headers = new Headers();
const orgs = [{ id: "org-a" }, { id: "org-b" }];

beforeEach(() => {
  vi.clearAllMocks();
  clearWorkspaceCreatedHandler();
  api.listOrganizations.mockResolvedValue(orgs);
  api.setActiveOrganization.mockResolvedValue(undefined);
});

describe("ensureUserWorkspace", () => {
  it("keeps the workspace the session already points at", async () => {
    api.getSession.mockResolvedValue({
      session: { activeOrganizationId: "org-b" },
    });

    const id = await ensureUserWorkspace(user, headers);

    expect(id).toBe("org-b");
    expect(api.setActiveOrganization).not.toHaveBeenCalled();
  });

  it("falls back to the first workspace when the session has none", async () => {
    api.getSession.mockResolvedValue({ session: {} });

    const id = await ensureUserWorkspace(user, headers);

    expect(id).toBe("org-a");
    expect(api.setActiveOrganization).toHaveBeenCalledWith({
      headers,
      body: { organizationId: "org-a" },
    });
  });

  it("replaces an active workspace the user no longer belongs to", async () => {
    api.getSession.mockResolvedValue({
      session: { activeOrganizationId: "org-gone" },
    });

    const id = await ensureUserWorkspace(user, headers);

    expect(id).toBe("org-a");
    expect(api.setActiveOrganization).toHaveBeenCalledTimes(1);
  });

  it("creates a workspace when the user has none", async () => {
    api.listOrganizations.mockResolvedValue([]);
    api.createOrganization.mockResolvedValue({ id: "org-new" });

    const id = await ensureUserWorkspace(user, headers);

    expect(id).toBe("org-new");
    expect(api.getSession).not.toHaveBeenCalled();
  });

  it("runs the composition root's bootstrap for the workspace it created", async () => {
    api.listOrganizations.mockResolvedValue([]);
    api.createOrganization.mockResolvedValue({ id: "org-new" });
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    setWorkspaceCreatedHandler(bootstrap);

    await ensureUserWorkspace(user, headers);

    expect(bootstrap).toHaveBeenCalledWith({
      workspaceId: "org-new",
      userId: "u1",
      email: "u1@example.test",
    });
  });

  it("does not bootstrap a workspace it found rather than created", async () => {
    api.getSession.mockResolvedValue({ session: {} });
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    setWorkspaceCreatedHandler(bootstrap);

    await ensureUserWorkspace(user, headers);

    expect(bootstrap).not.toHaveBeenCalled();
  });

  it("prefers a handler passed by the caller over the registered one", async () => {
    api.listOrganizations.mockResolvedValue([]);
    api.createOrganization.mockResolvedValue({ id: "org-new" });
    const registered = vi.fn().mockResolvedValue(undefined);
    const passed = vi.fn().mockResolvedValue(undefined);
    setWorkspaceCreatedHandler(registered);

    await ensureUserWorkspace(user, headers, { onWorkspaceCreated: passed });

    expect(passed).toHaveBeenCalledTimes(1);
    expect(registered).not.toHaveBeenCalled();
  });

  it("points the session at the workspace it just created", async () => {
    // Without this write the creating request renders fine from the
    // returned id while the session still names no workspace, so the
    // next request that resolves by session alone finds none.
    api.listOrganizations.mockResolvedValue([]);
    api.createOrganization.mockResolvedValue({ id: "org-new" });

    await ensureUserWorkspace(user, headers);

    expect(api.setActiveOrganization).toHaveBeenCalledWith({
      headers,
      body: { organizationId: "org-new" },
    });
  });

  it("names the workspace from the user, so racing callers collide", async () => {
    // The slug is what makes provisioning idempotent: a clock-derived
    // suffix differs per attempt, and every concurrent caller then
    // creates a workspace of its own.
    api.listOrganizations.mockResolvedValue([]);
    api.createOrganization.mockResolvedValue({ id: "org-new" });

    await ensureUserWorkspace(user, headers);
    await ensureUserWorkspace(user, headers);

    const [first, second] = api.createOrganization.mock.calls.map(
      (call) => (call[0] as { body: { slug: string } }).body.slug
    );
    expect(first).toBe(second);
    // Derived from the user, not from the clock.
    expect(first).toContain("u1");
  });

  it("adopts the winner when the slug is already taken", async () => {
    api.listOrganizations
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "org-winner" }]);
    api.createOrganization.mockRejectedValue(
      new Error("ORGANIZATION_ALREADY_EXISTS")
    );

    const id = await ensureUserWorkspace(user, headers);

    expect(id).toBe("org-winner");
    expect(api.setActiveOrganization).toHaveBeenCalledWith({
      headers,
      body: { organizationId: "org-winner" },
    });
  });
});
