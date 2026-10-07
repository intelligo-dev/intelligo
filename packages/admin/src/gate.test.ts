import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePlatformAdmin = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@intelligo-dev/auth", () => ({ requirePlatformAdmin }));
vi.mock("@intelligo-dev/core/db", () => ({ db: {} }));

const { listUsers, queryAuditEvents } = await import("./queries");
const { getRevenue } = await import("./usage");

describe("the cross-tenant read models", () => {
  beforeEach(() => {
    requirePlatformAdmin.mockReset();
    requirePlatformAdmin.mockRejectedValue(
      new Error("Insufficient permissions")
    );
  });

  it("refuse a caller who is not a platform admin before reading anything", async () => {
    await expect(listUsers()).rejects.toThrow("Insufficient permissions");
    await expect(getRevenue()).rejects.toThrow("Insufficient permissions");
    await expect(queryAuditEvents({})).rejects.toThrow(
      "Insufficient permissions"
    );
  });
});
