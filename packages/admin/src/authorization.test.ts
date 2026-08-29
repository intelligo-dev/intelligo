/**
 * Admin authorization tests.
 *
 * Two contracts matter here, and they are deliberately opposite:
 *
 *  - reading must not be blocked by a failed audit write (a support
 *    engineer mid-incident should not be locked out by a logging
 *    problem);
 *  - a destructive or impersonating action must be refused if it
 *    cannot be recorded, because "who did this" has to be answerable
 *    afterwards.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  recordAuditEvent: vi.fn(),
  recordAuditEventOrThrow: vi.fn(),
}));

vi.mock("@intelligo/auth", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));

vi.mock("@intelligo/audit", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
  recordAuditEventOrThrow: mocks.recordAuditEventOrThrow,
}));

vi.mock("server-only", () => ({}));

import { requireAdmin, requireAdminOrRefuse } from "./authorization";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePlatformAdmin.mockResolvedValue({
    user: { id: "u-admin", email: "admin@example.test" },
  });
  mocks.recordAuditEvent.mockResolvedValue(undefined);
  mocks.recordAuditEventOrThrow.mockResolvedValue(undefined);
});

describe("requireAdmin", () => {
  it("gates on the platform admin check, not a workspace role", async () => {
    // Workspace `owner` is per-tenant and every self-serve signup has
    // one, which is how platform-wide analytics leaked before.
    await requireAdmin("admin.overview.viewed");

    expect(mocks.requirePlatformAdmin).toHaveBeenCalledTimes(1);
  });

  it("refuses when the caller is not a platform admin", async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(
      new Error("Insufficient permissions")
    );

    await expect(requireAdmin("admin.overview.viewed")).rejects.toThrow(
      "Insufficient permissions"
    );
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("records the access as a support action against the tenant", async () => {
    await requireAdmin("admin.workspace.viewed", {
      kind: "workspace",
      id: "ws-1",
      workspaceId: "ws-1",
    });

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorKind: "support",
        actorId: "u-admin",
        action: "admin.workspace.viewed",
        resourceKind: "workspace",
        resourceId: "ws-1",
        workspaceId: "ws-1",
      })
    );
  });

  it("still authorizes a read when the audit write fails", async () => {
    // recordAuditEvent swallows its own failures; this asserts the
    // gate does not add one back.
    mocks.recordAuditEvent.mockResolvedValue(undefined);

    await expect(requireAdmin("admin.overview.viewed")).resolves.toMatchObject({
      userId: "u-admin",
    });
  });
});

describe("requireAdminOrRefuse", () => {
  it("uses the throwing audit write", async () => {
    await requireAdminOrRefuse("admin.workspace.impersonated", {
      kind: "workspace",
      id: "ws-1",
      workspaceId: "ws-1",
    });

    expect(mocks.recordAuditEventOrThrow).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("refuses the action when it cannot be recorded", async () => {
    // Acting as a customer with no trail of who did it is the one
    // thing this package must not allow.
    mocks.recordAuditEventOrThrow.mockRejectedValue(new Error("audit down"));

    await expect(
      requireAdminOrRefuse("admin.workspace.impersonated", {
        kind: "workspace",
        id: "ws-1",
      })
    ).rejects.toThrow("audit down");
  });

  it("checks authorization before writing anything", async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(
      new Error("Insufficient permissions")
    );

    await expect(
      requireAdminOrRefuse("admin.workspace.impersonated", {
        kind: "workspace",
      })
    ).rejects.toThrow("Insufficient permissions");
    expect(mocks.recordAuditEventOrThrow).not.toHaveBeenCalled();
  });
});
