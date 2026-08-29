/**
 * Daily-series assembly in the usage overview action.
 *
 * `summarizeExecutionsByDay` returns only the days something ran on;
 * the action fills the rest with zero. That gap-filling is the part
 * worth testing, because on a chart a quiet Tuesday and a missing
 * Tuesday draw identically — the bug would be invisible in the UI and
 * wrong in the numbers.
 *
 * The package reads are mocked: this asserts on the action's own
 * shaping, not on drizzle.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireWorkspace: vi.fn(),
  summarizeExecutions: vi.fn(),
  summarizeExecutionsByDay: vi.fn(),
  listExecutions: vi.fn(),
  getQuotaThresholds: vi.fn(),
  getTrialStatus: vi.fn(),
  getWorkspaceBilling: vi.fn(),
}));

vi.mock("@intelligo-dev/auth", () => ({
  requireWorkspace: mocks.requireWorkspace,
}));

vi.mock("@intelligo-dev/executions", () => ({
  summarizeExecutions: mocks.summarizeExecutions,
  summarizeExecutionsByDay: mocks.summarizeExecutionsByDay,
  listExecutions: mocks.listExecutions,
}));

vi.mock("@intelligo-dev/billing", () => ({
  getQuotaThresholds: mocks.getQuotaThresholds,
  getTrialStatus: mocks.getTrialStatus,
  getWorkspaceBilling: mocks.getWorkspaceBilling,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

import { getUsageOverview } from "@/actions/usage";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Mid-month, so the current-period window is a known 12-day span.
  vi.setSystemTime(new Date("2026-03-12T10:00:00Z"));

  mocks.requireWorkspace.mockResolvedValue({ workspace: { id: "ws_1" } });
  mocks.summarizeExecutions.mockResolvedValue({
    totals: { totalTokens: 0, chargedMnt: 0, count: 0 },
  });
  mocks.listExecutions.mockResolvedValue([]);
  mocks.getQuotaThresholds.mockResolvedValue({
    percentage: 0,
    warningThreshold: false,
    criticalThreshold: false,
  });
  mocks.getTrialStatus.mockResolvedValue({
    hasTrialCredits: false,
    status: "none",
    creditsRemaining: 0,
    initialCredits: 0,
    percentageRemaining: 0,
  });
  mocks.getWorkspaceBilling.mockResolvedValue({
    plan: { name: "Free", slug: "free" },
    billingMode: "subscription",
  });
  mocks.summarizeExecutionsByDay.mockResolvedValue([]);
});

async function daily() {
  const result = await getUsageOverview();
  if (!result.success) throw new Error(result.error);
  return result.data.daily;
}

describe("getUsageOverview daily series", () => {
  it("covers every day of the period, including ones nothing ran on", async () => {
    const points = await daily();

    expect(points).toHaveLength(12); // March 1st through the 12th
    expect(points[0]!.date).toBe("2026-03-01");
    expect(points.at(-1)!.date).toBe("2026-03-12");
    expect(points.every((point) => point.tokensUsed === 0)).toBe(true);
  });

  it("keeps the days the read model reported and zeroes the rest", async () => {
    mocks.summarizeExecutionsByDay.mockResolvedValue([
      { date: "2026-03-03", totalTokens: 1200, count: 4, chargedMnt: 7 },
      { date: "2026-03-09", totalTokens: 500, count: 2, chargedMnt: 3 },
    ]);

    const points = await daily();
    const byDate = new Map(points.map((point) => [point.date, point]));

    expect(byDate.get("2026-03-03")).toMatchObject({
      tokensUsed: 1200,
      requestCount: 4,
    });
    expect(byDate.get("2026-03-09")).toMatchObject({
      tokensUsed: 500,
      requestCount: 2,
    });
    expect(byDate.get("2026-03-04")).toMatchObject({
      tokensUsed: 0,
      requestCount: 0,
    });
  });

  it("returns days in ascending order, so the chart cannot draw backwards", async () => {
    mocks.summarizeExecutionsByDay.mockResolvedValue([
      { date: "2026-03-09", totalTokens: 500, count: 2, chargedMnt: 3 },
      { date: "2026-03-03", totalTokens: 1200, count: 4, chargedMnt: 7 },
    ]);

    const dates = (await daily()).map((point) => point.date);
    expect([...dates].sort()).toEqual(dates);
  });
});
