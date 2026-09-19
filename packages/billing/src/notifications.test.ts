/**
 * notifications.ts — the quota notice is about money. The thresholds
 * arrive as micros of the deployment's billing currency; what leaves is
 * an amount with that currency, filed once per UTC month.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getQuotaThresholds: vi.fn(),
  getBillingSettings: vi.fn(),
  getTrialStatus: vi.fn(),
  triggerQuotaNotification: vi.fn(),
  triggerTrialNotification: vi.fn(),
  insertValues: vi.fn(),
  onConflictDoNothing: vi.fn(),
}));

vi.mock("@intelligo-dev/core/db", () => ({
  db: {
    insert: () => ({
      values: (row: unknown) => {
        mocks.insertValues(row);
        return { onConflictDoNothing: mocks.onConflictDoNothing };
      },
    }),
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: async () => [
                {
                  workspaceName: "Acme",
                  userId: "user-1",
                  email: "owner@example.com",
                },
              ],
            }),
          }),
        }),
      }),
    }),
  },
}));
vi.mock("@intelligo-dev/core/db/schema", () => ({
  notificationHistory: {},
  organization: {},
  users: {},
  member: {},
}));
vi.mock("@intelligo-dev/core/notifications", () => ({
  triggerQuotaNotification: mocks.triggerQuotaNotification,
  triggerTrialNotification: mocks.triggerTrialNotification,
}));
vi.mock("./quota", () => ({ getQuotaThresholds: mocks.getQuotaThresholds }));
vi.mock("./trial", () => ({ getTrialStatus: mocks.getTrialStatus }));
vi.mock("./billing-settings", () => ({
  getBillingSettings: mocks.getBillingSettings,
}));
vi.mock("./quota-usage", () => ({ getCurrentPeriodKey: () => "2026-08" }));

import { money } from "@intelligo-dev/core/money";
import { checkNotificationTriggers } from "./notifications";

function thresholds(usedMicros: number, limitMicros: number) {
  const percentage = Math.min(
    100,
    Math.round((usedMicros / limitMicros) * 100)
  );
  return {
    percentage,
    warningThreshold: percentage >= 80,
    criticalThreshold: percentage >= 100,
    usedMicros,
    limitMicros,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getBillingSettings.mockResolvedValue({
    currency: "USD",
    usdRateMicros: 1_000_000,
    marginBp: 40_000,
  });
  mocks.getTrialStatus.mockResolvedValue({ status: "none" });
  mocks.onConflictDoNothing.mockResolvedValue({ rowCount: 1 });
  mocks.triggerQuotaNotification.mockResolvedValue(undefined);
});

describe("checkNotificationTriggers", () => {
  it("reports the warning as money used out of a money allowance", async () => {
    mocks.getQuotaThresholds.mockResolvedValue(
      thresholds(12_150_000, 15_000_000)
    );

    const [notification] = await checkNotificationTriggers("ws-1");

    expect(notification).toEqual({
      type: "quota_warning_80",
      workspaceId: "ws-1",
      message: "You've used $12.15 of your $15.00 monthly allowance (81%).",
      data: {
        percentage: 81,
        usedMicros: 12_150_000,
        allowanceMicros: 15_000_000,
        currency: "USD",
      },
    });
  });

  it("hands the trigger amounts in the billing currency, not token counts", async () => {
    mocks.getQuotaThresholds.mockResolvedValue(
      thresholds(15_000_000, 15_000_000)
    );

    const [notification] = await checkNotificationTriggers("ws-1");

    expect(notification!.type).toBe("quota_warning_100");
    expect(notification!.message).toBe(
      "Your $15.00 monthly allowance is fully used. Upgrade your plan for more."
    );
    expect(notification!.message).not.toMatch(/token/i);

    expect(mocks.triggerQuotaNotification).toHaveBeenCalledTimes(1);
    const params = mocks.triggerQuotaNotification.mock.calls[0]![0];
    expect(params).toEqual({
      userId: "user-1",
      userEmail: "owner@example.com",
      workspaceId: "ws-1",
      workspaceName: "Acme",
      percentageUsed: 100,
      used: money(15_000_000, "USD"),
      allowance: money(15_000_000, "USD"),
      isExceeded: true,
    });
    expect(params).not.toHaveProperty("tokensUsed");
    expect(params).not.toHaveProperty("tokensLimit");
  });

  it("denominates the amounts in whatever the deployment bills in", async () => {
    mocks.getBillingSettings.mockResolvedValue({
      currency: "EUR",
      usdRateMicros: 920_000,
      marginBp: 40_000,
    });
    mocks.getQuotaThresholds.mockResolvedValue(
      thresholds(9_000_000, 10_000_000)
    );

    await checkNotificationTriggers("ws-1");

    const params = mocks.triggerQuotaNotification.mock.calls[0]![0];
    expect(params.used).toEqual(money(9_000_000, "EUR"));
    expect(params.allowance).toEqual(money(10_000_000, "EUR"));
  });

  it("files the quota notice under the UTC period key", async () => {
    mocks.getQuotaThresholds.mockResolvedValue(
      thresholds(12_150_000, 15_000_000)
    );

    await checkNotificationTriggers("ws-1");

    expect(mocks.insertValues.mock.calls[0]![0]).toMatchObject({
      workspaceId: "ws-1",
      type: "quota_warning_80",
      periodKey: "2026-08",
    });
  });

  it("sends nothing when the period already holds the notice", async () => {
    mocks.onConflictDoNothing.mockResolvedValue({ rowCount: 0 });
    mocks.getQuotaThresholds.mockResolvedValue(
      thresholds(12_150_000, 15_000_000)
    );

    await checkNotificationTriggers("ws-1");

    expect(mocks.triggerQuotaNotification).not.toHaveBeenCalled();
  });

  it("stays quiet below the warning threshold", async () => {
    mocks.getQuotaThresholds.mockResolvedValue(
      thresholds(1_000_000, 15_000_000)
    );

    expect(await checkNotificationTriggers("ws-1")).toEqual([]);
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });
});
