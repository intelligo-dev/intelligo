/**
 * Impersonation.
 *
 * The properties that make it safe to have at all: nothing happens
 * before the audit event is durable, a reason is mandatory, ending is
 * recorded as well as starting, and the check cannot be skipped by
 * calling the session mechanics directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  getAuthSession: vi.fn(),
  recordAuditEvent: vi.fn(),
  recordAuditEventOrThrow: vi.fn(),
  impersonateUser: vi.fn(),
  stopImpersonating: vi.fn(),
}));

vi.mock("@intelligo-dev/auth", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
  getAuthSession: mocks.getAuthSession,
  impersonateUser: mocks.impersonateUser,
  stopImpersonating: mocks.stopImpersonating,
}));

vi.mock("@intelligo-dev/audit", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
  recordAuditEventOrThrow: mocks.recordAuditEventOrThrow,
}));

vi.mock("server-only", () => ({}));

import { startImpersonation, stopImpersonation } from "./impersonation";

const expiresAt = new Date("2026-08-26T04:30:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePlatformAdmin.mockResolvedValue({
    user: { id: "u-admin", email: "admin@example.test" },
  });
  mocks.recordAuditEventOrThrow.mockResolvedValue(undefined);
  mocks.impersonateUser.mockResolvedValue({
    targetUserId: "u-target",
    expiresAt,
  });
  mocks.stopImpersonating.mockResolvedValue(undefined);
  // During impersonation the cookie is the TARGET's session, stamped
  // with the admin who started it.
  mocks.getAuthSession.mockResolvedValue({
    session: { impersonatedBy: "u-admin" },
    user: { id: "u-target", email: "target@example.test" },
  });
});

describe("startImpersonation", () => {
  it("issues the session and reports when it expires", async () => {
    const result = await startImpersonation({
      targetUserId: "u-target",
      reason: "ticket-1042",
    });

    expect(result).toEqual({ targetUserId: "u-target", expiresAt });
    expect(mocks.impersonateUser).toHaveBeenCalledWith("u-target");
  });

  it("refuses a non-admin before touching the session", async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(
      new Error("Insufficient permissions")
    );

    await expect(
      startImpersonation({ targetUserId: "u-target", reason: "ticket-1042" })
    ).rejects.toThrow("Insufficient permissions");

    expect(mocks.impersonateUser).not.toHaveBeenCalled();
  });

  it("refuses when the audit event cannot be written", async () => {
    // The whole point of requireAdminOrRefuse: acting as someone with
    // no record of it leaves nobody able to answer "who did this".
    mocks.recordAuditEventOrThrow.mockRejectedValue(new Error("audit down"));

    await expect(
      startImpersonation({ targetUserId: "u-target", reason: "ticket-1042" })
    ).rejects.toThrow("audit down");

    expect(mocks.impersonateUser).not.toHaveBeenCalled();
  });

  it("requires a reason", async () => {
    await expect(
      startImpersonation({ targetUserId: "u-target", reason: "   " })
    ).rejects.toThrow(/reason/i);

    expect(mocks.recordAuditEventOrThrow).not.toHaveBeenCalled();
    expect(mocks.impersonateUser).not.toHaveBeenCalled();
  });

  it("records the start against the target user", async () => {
    await startImpersonation({
      targetUserId: "u-target",
      reason: "ticket-1042",
    });

    expect(mocks.recordAuditEventOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.impersonation.started",
        actorId: "u-admin",
        actorKind: "support",
        resourceKind: "user",
        resourceId: "u-target",
      })
    );
  });

  it("audits before the session exists, not after", async () => {
    const order: string[] = [];
    mocks.recordAuditEventOrThrow.mockImplementation(async () => {
      order.push("audit");
    });
    mocks.impersonateUser.mockImplementation(async () => {
      order.push("session");
      return { targetUserId: "u-target", expiresAt };
    });

    await startImpersonation({
      targetUserId: "u-target",
      reason: "ticket-1042",
    });

    expect(order).toEqual(["audit", "session"]);
  });
});

describe("stopImpersonation", () => {
  it("records the end, attributed to the admin the session names — a start with no end reads as still open", async () => {
    await stopImpersonation({ targetUserId: "u-target" });

    expect(mocks.recordAuditEventOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.impersonation.stopped",
        actorId: "u-admin",
        resourceId: "u-target",
      })
    );
    expect(mocks.stopImpersonating).toHaveBeenCalled();
  });

  it("does not gate on the caller being an admin — the caller is the target while impersonating", async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(
      new Error("Insufficient permissions")
    );

    await expect(
      stopImpersonation({ targetUserId: "u-target" })
    ).resolves.toBeUndefined();
    expect(mocks.requirePlatformAdmin).not.toHaveBeenCalled();
  });

  it("refuses a session that is not impersonating anyone", async () => {
    mocks.getAuthSession.mockResolvedValue({
      session: {},
      user: { id: "u-target" },
    });

    await expect(
      stopImpersonation({ targetUserId: "u-target" })
    ).rejects.toThrow(/Not impersonating/);
    expect(mocks.stopImpersonating).not.toHaveBeenCalled();
    expect(mocks.recordAuditEventOrThrow).not.toHaveBeenCalled();
  });

  it("refuses to stop for a user other than the one the session impersonates", async () => {
    await expect(
      stopImpersonation({ targetUserId: "u-someone-else" })
    ).rejects.toThrow(/different user/);
    expect(mocks.stopImpersonating).not.toHaveBeenCalled();
  });

  it("does not end the session when the audit write fails", async () => {
    mocks.recordAuditEventOrThrow.mockRejectedValue(new Error("audit down"));

    await expect(
      stopImpersonation({ targetUserId: "u-target" })
    ).rejects.toThrow("audit down");
    expect(mocks.stopImpersonating).not.toHaveBeenCalled();
  });
});
