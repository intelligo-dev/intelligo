/**
 * The session swap is gated where it happens, so importing it directly
 * cannot skip the check: the caller must be a platform admin and the target
 * must not be one.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  selectTarget: vi.fn(),
  impersonateUser: vi.fn(),
  stopImpersonating: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@intelligo-dev/core/request-context", () => ({
  getRequestHeaders: vi.fn(async () => new Headers()),
}));

vi.mock("@intelligo-dev/core/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => mocks.selectTarget() }),
      }),
    }),
  },
}));

vi.mock("@intelligo-dev/core/db/schema", () => ({
  users: { id: "id", email: "email", role: "role" },
}));

vi.mock("./helpers", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));

vi.mock("./server", () => ({
  auth: {
    api: {
      impersonateUser: mocks.impersonateUser,
      stopImpersonating: mocks.stopImpersonating,
    },
  },
}));

import { AuthGuardError } from "./guard-error";
import { impersonateUser, stopImpersonating } from "./impersonation";

const expiresAt = new Date("2026-08-26T04:30:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("PLATFORM_ADMIN_EMAILS", "");
  mocks.requirePlatformAdmin.mockResolvedValue({
    session: { id: "sess_admin" },
    user: { id: "u-admin", email: "admin@example.test" },
  });
  mocks.selectTarget.mockResolvedValue([
    { email: "target@example.test", role: null },
  ]);
  mocks.impersonateUser.mockResolvedValue({ session: { expiresAt } });
});

describe("impersonateUser", () => {
  it("refuses a caller who is not a platform admin before touching the session", async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(
      new AuthGuardError("forbidden")
    );

    await expect(impersonateUser("u-target")).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(mocks.impersonateUser).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller", async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(
      new AuthGuardError("unauthenticated")
    );

    await expect(impersonateUser("u-target")).rejects.toMatchObject({
      code: "unauthenticated",
    });
    expect(mocks.impersonateUser).not.toHaveBeenCalled();
  });

  it("lets a platform admin impersonate an ordinary user", async () => {
    await expect(impersonateUser("u-target")).resolves.toEqual({
      targetUserId: "u-target",
      expiresAt,
    });
    expect(mocks.impersonateUser).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: "u-target" } })
    );
  });

  it("refuses a target who holds the platform admin role", async () => {
    mocks.selectTarget.mockResolvedValue([
      { email: "other-admin@example.test", role: "user,platform-admin" },
    ]);

    await expect(impersonateUser("u-other-admin")).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(mocks.impersonateUser).not.toHaveBeenCalled();
  });

  it("refuses a target the allowlist names, even before their first promotion", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "Pending-Admin@example.test");
    mocks.selectTarget.mockResolvedValue([
      { email: "pending-admin@example.test", role: null },
    ]);

    await expect(impersonateUser("u-pending-admin")).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(mocks.impersonateUser).not.toHaveBeenCalled();
  });

  it("falls back to the configured cap when Better-Auth reports no expiry", async () => {
    mocks.impersonateUser.mockResolvedValue({});
    const before = Date.now();

    const result = await impersonateUser("u-target");

    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 30 * 60_000
    );
  });
});

describe("stopImpersonating", () => {
  it("does not gate on the platform admin role — the caller's session is the target's", async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(
      new AuthGuardError("forbidden")
    );

    await expect(stopImpersonating()).resolves.toBeUndefined();
    expect(mocks.requirePlatformAdmin).not.toHaveBeenCalled();
    expect(mocks.stopImpersonating).toHaveBeenCalled();
  });
});
