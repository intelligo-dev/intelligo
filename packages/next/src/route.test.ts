import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class AuthGuardError extends Error {
    constructor(
      readonly code: "unauthenticated" | "no_workspace" | "forbidden"
    ) {
      super(code);
    }
  }
  return {
    AuthGuardError,
    requireAuth: vi.fn(),
    requireWorkspace: vi.fn(),
    requireRole: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@intelligo-dev/auth", () => ({
  requireAuth: mocks.requireAuth,
  requireWorkspace: mocks.requireWorkspace,
  requireRole: mocks.requireRole,
  isAuthGuardError: (error: unknown) => error instanceof mocks.AuthGuardError,
}));

import { withAuth, withRole, withWorkspace } from "./route";

const request = new Request("https://app.test/api/thing");
const session = { session: { id: "s_1" }, user: { id: "u_1" } };
const workspaceContext = {
  ...session,
  workspace: { id: "ws_1", name: "Acme", slug: "acme" },
  membership: { id: "m_1", role: "owner" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withAuth", () => {
  it("runs the handler with the session, the request and the route context", async () => {
    mocks.requireAuth.mockResolvedValue(session);
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const context = { params: Promise.resolve({ id: "1" }) };

    const response = await withAuth(handler)(request, context);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(request, session, context);
  });

  it("answers 401 without calling the handler when there is no session", async () => {
    mocks.requireAuth.mockRejectedValue(
      new mocks.AuthGuardError("unauthenticated")
    );
    const handler = vi.fn();

    const response = await withAuth(handler)(request, undefined);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("rethrows a guard failure that is not an auth guard error", async () => {
    const outage = new Error("database unreachable");
    mocks.requireAuth.mockRejectedValue(outage);

    await expect(withAuth(vi.fn())(request, undefined)).rejects.toBe(outage);
  });

  it("never maps the handler's own errors, auth guard errors included", async () => {
    mocks.requireAuth.mockResolvedValue(session);
    const inner = new mocks.AuthGuardError("forbidden");

    await expect(
      withAuth(async () => {
        throw inner;
      })(request, undefined)
    ).rejects.toBe(inner);
  });
});

describe("withWorkspace", () => {
  it("runs the handler with the workspace context", async () => {
    mocks.requireWorkspace.mockResolvedValue(workspaceContext);
    const handler = vi.fn(async () => new Response(null, { status: 204 }));

    const response = await withWorkspace(handler)(request, undefined);

    expect(response.status).toBe(204);
    expect(handler).toHaveBeenCalledWith(request, workspaceContext, undefined);
  });

  it("answers 403 when the caller has no workspace", async () => {
    mocks.requireWorkspace.mockRejectedValue(
      new mocks.AuthGuardError("no_workspace")
    );

    const response = await withWorkspace(vi.fn())(request, undefined);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "no_workspace" });
  });
});

describe("withRole", () => {
  it("checks the given roles and runs the handler with the workspace context", async () => {
    mocks.requireRole.mockResolvedValue(workspaceContext);
    const handler = vi.fn(async () => Response.json({ ok: true }));

    const response = await withRole(["owner", "admin"], handler)(
      request,
      undefined
    );

    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith(["owner", "admin"]);
    expect(handler).toHaveBeenCalledWith(request, workspaceContext, undefined);
  });

  it("answers 403 when the member lacks the role", async () => {
    mocks.requireRole.mockRejectedValue(new mocks.AuthGuardError("forbidden"));
    const handler = vi.fn();

    const response = await withRole(["owner"], handler)(request, undefined);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("answers 401 when there is no session", async () => {
    mocks.requireRole.mockRejectedValue(
      new mocks.AuthGuardError("unauthenticated")
    );

    const response = await withRole(["member"], vi.fn())(request, undefined);

    expect(response.status).toBe(401);
  });
});
