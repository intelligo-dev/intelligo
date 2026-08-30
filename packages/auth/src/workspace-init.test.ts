/**
 * ensureUserWorkspace.
 *
 * The authenticated layout calls this on every render. It used to set
 * the first-listed workspace active unconditionally, which undid every
 * switch the moment the layout re-rendered. The property that matters:
 * a valid active workspace is kept; only a missing or stale one is
 * replaced.
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

const user = { id: "u1", email: "u1@example.test", name: "U" } as never;
const headers = new Headers();
const orgs = [{ id: "org-a" }, { id: "org-b" }];

beforeEach(() => {
  vi.clearAllMocks();
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
});
