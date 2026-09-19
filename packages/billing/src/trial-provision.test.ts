/**
 * provisionTrialCredits — the abuse limits are what stand between a
 * trial and a script that signs up in a loop, so a refused check must
 * leave the workspace without a grant.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  checkTrialAbuse: vi.fn(),
  insertValues: vi.fn(),
}));

vi.mock("./trial-abuse", () => ({
  checkTrialAbuse: mocks.checkTrialAbuse,
  normalizeEmailForAbuseCheck: (email: string) => email,
}));
vi.mock("./trial-types", async () => {
  const { money } = await import("@intelligo-dev/core/money");
  return {
    getTrialConfig: () => ({
      durationDays: 14,
      initialCredits: 1000,
      grant: money(5_000_000, "USD"),
    }),
  };
});
vi.mock("./billing-settings", () => ({
  getBillingSettings: async () => ({ currency: "USD" }),
}));
vi.mock("@intelligo-dev/core/email", () => ({ sendTrialExpiryEmail: vi.fn() }));
vi.mock("@intelligo-dev/core/db", () => ({
  db: {
    insert: () => ({
      values: (values: unknown) => {
        mocks.insertValues(values);
        return {
          onConflictDoNothing: () => ({
            returning: async () => [{ id: "trial-1" }],
          }),
        };
      },
    }),
  },
}));

import { provisionTrialCredits } from "./trial";

const input = { workspaceId: "ws-1", email: "a@example.com", ipAddress: "1.2.3.4" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("provisionTrialCredits", () => {
  it("grants the trial when the abuse check allows it", async () => {
    mocks.checkTrialAbuse.mockResolvedValue({ allowed: true });
    expect(await provisionTrialCredits(input)).toEqual({ id: "trial-1" });
    expect(mocks.checkTrialAbuse).toHaveBeenCalledWith(
      "a@example.com",
      "1.2.3.4"
    );
  });

  it("grants nothing when the email or address is over its limit", async () => {
    mocks.checkTrialAbuse.mockResolvedValue({
      allowed: false,
      reason: "Trial limit reached for this email",
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await provisionTrialCredits(input)).toBeNull();
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });
});
