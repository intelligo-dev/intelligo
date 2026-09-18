/**
 * quota.ts reporting and reservation lifecycle:
 * `cleanupExpiredReservations`, `releaseReservation`,
 * `findSettlementByRequestId`, `resetMonthlyQuota`, `getUsageSummary`
 * and `getQuotaThresholds`.
 *
 * `findSettlementByRequestId` matters most: it answers
 * `executions.reconcile()`'s question for a row stuck in `settling` —
 * was this request already charged? — and it has three outcomes, one of
 * which is an empty object rather than null. Getting that wrong either
 * charges a workspace twice or drops a charge.
 *
 * Its own file because these need `delete().where().returning()`, a
 * bare `update().set().where()` and grouped selects, which the db fakes
 * in `quota.test.ts` and `quota-settlement.test.ts` are not shaped for.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceBilling: vi.fn(),
  getCurrentMonthlyUsage: vi.fn(),
  getBillingSettings: vi.fn(),
  getPlanMessageLimit: vi.fn(),
}));

/**
 * What the fake database holds and what it was asked to do. Every
 * builder below records into `calls`, so a test can assert the shape of
 * a write without a real driver.
 */
const state = vi.hoisted(() => ({
  /** Rows `select(...).from(usageRecords)` returns, per call, in order. */
  selectRows: [] as unknown[][],
  /** Rows the `delete(...).returning()` chain reports as removed. */
  deleted: [] as unknown[],
  calls: [] as string[],
  /** The `set(...)` payload of the last update. */
  lastUpdate: null as Record<string, unknown> | null,
  /** The `values(...)` payload of the last insert. */
  lastInsert: null as Record<string, unknown> | null,
  /** The conflict target the last insert declared. */
  lastConflict: null as unknown,
}));

vi.mock("./queries", () => ({
  getWorkspaceBilling: mocks.getWorkspaceBilling,
}));
vi.mock("./quota-usage", () => ({
  getCurrentMonthlyUsage: mocks.getCurrentMonthlyUsage,
  getCurrentPeriodStart: () => new Date("2026-08-01T00:00:00.000Z"),
  getCurrentPeriodEnd: () => new Date("2026-08-31T00:00:00.000Z"),
}));
vi.mock("./trial", () => ({ getActiveTrialGrant: vi.fn() }));
vi.mock("./billing-settings", () => ({
  getBillingSettings: mocks.getBillingSettings,
}));
vi.mock("./notifications", () => ({
  checkNotificationTriggers: vi.fn(),
}));
vi.mock("./quota-plan", async () => {
  const { money } = await import("@intelligo-dev/core/money");
  return {
    // free: a 2000₮ monthly allowance. "none" is a plan with no
    // allowance at all, which is the divide-by-zero guard's case.
    getPlanMonthlyAllowance: (slug: string, currency: string) =>
      money(slug === "none" ? 0 : 2000 * 1_000_000, currency),
    getPlanMessageLimit: mocks.getPlanMessageLimit,
  };
});
vi.mock("@intelligo-dev/executions/pricing", () => ({
  estimateWorstCaseCharge: vi.fn(),
  chargeFor: vi.fn(),
  UnknownModelError: class extends Error {},
}));
vi.mock("@intelligo-dev/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@intelligo-dev/core/db/schema", () => {
  const table = (name: string) =>
    new Proxy({ __name: name } as Record<string, unknown>, {
      get: (target, key) =>
        key === "__name" ? name : `${name}.${String(key)}`,
    });
  return {
    usageRecords: table("usage_records"),
    monthlyUsage: table("monthly_usage"),
    creditBalances: table("credit_balances"),
    creditReservations: table("credit_reservations"),
    trialCredits: table("trial_credits"),
    subscriptions: table("subscriptions"),
  };
});

vi.mock("@intelligo-dev/core/db", () => {
  /** Each `select()` consumes the next queued row set. */
  const nextRows = () => state.selectRows.shift() ?? [];

  const selectChain = () => {
    const rows = () => Promise.resolve(nextRows());
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.groupBy = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => rows());
    chain.limit = vi.fn(() => rows());
    // A grouped read with no orderBy is awaited directly.
    chain.then = (resolve: (value: unknown) => unknown) => rows().then(resolve);
    return chain;
  };

  return {
    db: {
      select: vi.fn(() => selectChain()),
      delete: vi.fn((t: { __name: string }) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            state.calls.push(`delete ${t.__name}`);
            return state.deleted;
          }),
        })),
      })),
      update: vi.fn((t: { __name: string }) => ({
        set: vi.fn((payload: Record<string, unknown>) => ({
          where: vi.fn(async () => {
            state.calls.push(`update ${t.__name}`);
            state.lastUpdate = payload;
          }),
        })),
      })),
      insert: vi.fn((t: { __name: string }) => ({
        values: vi.fn((payload: Record<string, unknown>) => {
          state.calls.push(`insert ${t.__name}`);
          state.lastInsert = payload;
          return {
            onConflictDoNothing: vi.fn(async (target: unknown) => {
              state.lastConflict = target;
            }),
          };
        }),
      })),
    },
  };
});

import {
  RESERVATION_TTL_MS,
  cleanupExpiredReservations,
  findSettlementByRequestId,
  getQuotaThresholds,
  getUsageSummary,
  releaseReservation,
  resetMonthlyQuota,
} from "./quota";

beforeEach(() => {
  vi.clearAllMocks();
  state.selectRows = [];
  state.deleted = [];
  state.calls = [];
  state.lastUpdate = null;
  state.lastInsert = null;
  state.lastConflict = null;

  mocks.getWorkspaceBilling.mockResolvedValue({ plan: { slug: "free" } });
  mocks.getCurrentMonthlyUsage.mockResolvedValue({
    tokensUsed: 0,
    allowanceUsedMicros: 0,
    currency: "MNT",
    requestCount: 0,
  });
  mocks.getBillingSettings.mockResolvedValue({
    currency: "MNT",
    usdRateMicros: 3_450_000_000,
    marginBp: 40_000,
  });
  mocks.getPlanMessageLimit.mockReturnValue(100);
});

describe("the reservation TTL", () => {
  it("outlives the chat route's maxDuration", () => {
    // A reservation that expires under a still-streaming request stops
    // counting against the balance, and a second request is admitted
    // against credit the first is about to spend. The route's ceiling
    // is 300s.
    expect(RESERVATION_TTL_MS).toBeGreaterThan(300_000);
    expect(RESERVATION_TTL_MS).toBe(600_000);
  });
});

describe("cleanupExpiredReservations", () => {
  it("reports how many rows it removed", async () => {
    state.deleted = [{ id: "a" }, { id: "b" }, { id: "c" }];
    await expect(cleanupExpiredReservations()).resolves.toBe(3);
    expect(state.calls).toEqual(["delete credit_reservations"]);
  });

  it("reports zero when there was nothing to remove", async () => {
    state.deleted = [];
    await expect(cleanupExpiredReservations()).resolves.toBe(0);
  });
});

describe("releaseReservation", () => {
  it("marks the hold settled and stamps when", async () => {
    // Settled rather than deleted: the row is what anyone
    // reconstructing a request's history reads, and the cleanup cron
    // removes it later.
    const before = Date.now();
    await releaseReservation("req-1");

    expect(state.calls).toEqual(["update credit_reservations"]);
    expect(state.lastUpdate).toMatchObject({ status: "settled" });
    const settledAt = state.lastUpdate?.settledAt as Date;
    expect(settledAt).toBeInstanceOf(Date);
    expect(settledAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe("findSettlementByRequestId", () => {
  it("returns null when the request was never charged", async () => {
    // `executions.reconcile()` reads this to decide whether a row stuck
    // in `settling` still owes a charge. Null means it does.
    state.selectRows = [[]];
    await expect(
      findSettlementByRequestId("ws-1", "req-1")
    ).resolves.toBeNull();
  });

  it("returns the amount when it was", async () => {
    state.selectRows = [[{ chargedMicros: 500_000_000, currency: "MNT" }]];
    const found = await findSettlementByRequestId("ws-1", "req-1");
    expect(found).toEqual({
      charged: { amount: 500_000_000, currency: "MNT" },
    });
  });

  it("distinguishes a charged row with no currency from no row at all", async () => {
    // The difference is not cosmetic: `{}` is truthy and null is not,
    // so a caller asking "was this charged?" gets yes here and no
    // above. A row without a currency was still a charge, and returning
    // null for it would charge the workspace a second time.
    state.selectRows = [[{ chargedMicros: 500_000_000, currency: null }]];
    const found = await findSettlementByRequestId("ws-1", "req-1");
    expect(found).not.toBeNull();
    expect(found).toEqual({});
  });

  it("reads a missing amount as zero rather than NaN", async () => {
    state.selectRows = [[{ chargedMicros: null, currency: "MNT" }]];
    const found = await findSettlementByRequestId("ws-1", "req-1");
    expect(found).toEqual({ charged: { amount: 0, currency: "MNT" } });
  });
});

describe("resetMonthlyQuota", () => {
  it("opens the current period with zeroed counters", async () => {
    await resetMonthlyQuota("ws-1");

    expect(state.calls).toEqual(["insert monthly_usage"]);
    expect(state.lastInsert).toMatchObject({
      workspaceId: "ws-1",
      periodStart: new Date("2026-08-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-31T00:00:00.000Z"),
      tokensUsed: 0,
      requestCount: 0,
    });
  });

  it("does nothing when the period row already exists", async () => {
    // Renewal webhooks retry. Without the conflict target a second
    // delivery would either throw or open a duplicate period, and the
    // old row is what historical reporting reads.
    await resetMonthlyQuota("ws-1");
    expect(state.lastConflict).toEqual({
      target: ["monthly_usage.workspaceId", "monthly_usage.periodStart"],
    });
  });
});

describe("getUsageSummary", () => {
  it("reports the period, and the breakdowns in the shape the page reads", async () => {
    mocks.getCurrentMonthlyUsage.mockResolvedValue({
      tokensUsed: 1234,
      allowanceUsedMicros: 500_000_000,
      currency: "MNT",
      requestCount: 25,
    });
    state.selectRows = [
      [{ model: "openai/gpt-5-mini", totalTokens: "900", requestCount: "20" }],
      [{ agent: "chat.message", totalTokens: "1234", requestCount: "25" }],
      [{ date: "2026-08-04", totalTokens: "1234", requestCount: "25" }],
    ];

    const summary = await getUsageSummary("ws-1");

    expect(summary.currentPeriod).toEqual({
      tokensUsed: 1234,
      requestCount: 25,
      limit: 100,
      percentage: 25,
    });
    // The driver returns sums as strings; the page does arithmetic on
    // them, so they have to arrive as numbers.
    expect(summary.byModel).toEqual([
      { model: "openai/gpt-5-mini", totalTokens: 900, requestCount: 20 },
    ]);
    expect(summary.byAgent).toEqual([
      { agent: "chat.message", totalTokens: 1234, requestCount: 25 },
    ]);
    expect(summary.daily).toEqual([
      { date: "2026-08-04", totalTokens: 1234, requestCount: 25 },
    ]);
  });

  it("names a row with no model or agent rather than dropping it", async () => {
    state.selectRows = [
      [{ model: null, totalTokens: "10", requestCount: "1" }],
      [{ agent: null, totalTokens: "10", requestCount: "1" }],
      [],
    ];

    const summary = await getUsageSummary("ws-1");

    expect(summary.byModel).toEqual([
      { model: "unknown", totalTokens: 10, requestCount: 1 },
    ]);
    expect(summary.byAgent).toEqual([
      { agent: "unknown", totalTokens: 10, requestCount: 1 },
    ]);
  });

  it("reports no percentage for a plan with no message limit", async () => {
    // Dividing by a zero limit would show Infinity on the usage page.
    mocks.getPlanMessageLimit.mockReturnValue(0);
    mocks.getCurrentMonthlyUsage.mockResolvedValue({
      tokensUsed: 10,
      allowanceUsedMicros: 0,
      currency: "MNT",
      requestCount: 5,
    });
    state.selectRows = [[], [], []];

    const summary = await getUsageSummary("ws-1");

    expect(summary.currentPeriod.percentage).toBe(0);
    expect(summary.currentPeriod.limit).toBe(0);
  });

  it("falls back to the free plan when the workspace has none", async () => {
    mocks.getWorkspaceBilling.mockResolvedValue({ plan: null });
    state.selectRows = [[], [], []];

    await getUsageSummary("ws-1");

    expect(mocks.getPlanMessageLimit).toHaveBeenCalledWith("free");
  });
});

describe("getQuotaThresholds", () => {
  const thresholds = (usedMicros: number) => {
    mocks.getCurrentMonthlyUsage.mockResolvedValue({
      tokensUsed: 0,
      allowanceUsedMicros: usedMicros,
      currency: "MNT",
      requestCount: 0,
    });
    return getQuotaThresholds("ws-1");
  };

  it("reports the percentage and the amounts behind it", async () => {
    const result = await thresholds(500_000_000); // 500₮ of 2000₮
    expect(result).toEqual({
      percentage: 25,
      warningThreshold: false,
      criticalThreshold: false,
      usedMicros: 500_000_000,
      limitMicros: 2_000_000_000,
    });
  });

  it("warns at exactly 80, not just past it", async () => {
    // The boundary is the whole point of the flag: a run that lands on
    // 80 should warn, and an off-by-one here is a notification that
    // never fires.
    expect((await thresholds(1_580_000_000)).warningThreshold).toBe(false); // 79%
    expect((await thresholds(1_600_000_000)).warningThreshold).toBe(true); // 80%
  });

  it("goes critical at exactly 100", async () => {
    expect((await thresholds(1_980_000_000)).criticalThreshold).toBe(false); // 99%
    expect((await thresholds(2_000_000_000)).criticalThreshold).toBe(true);
  });

  it("clamps an overspent period to 100 rather than reporting 130%", async () => {
    const result = await thresholds(2_600_000_000);
    expect(result.percentage).toBe(100);
    expect(result.criticalThreshold).toBe(true);
    // The raw amount is still reported, so a caller that wants the
    // overspend can see it.
    expect(result.usedMicros).toBe(2_600_000_000);
  });

  it("treats a negative balance as nothing used", async () => {
    const result = await thresholds(-500_000_000);
    expect(result.usedMicros).toBe(0);
    expect(result.percentage).toBe(0);
  });

  it("reports no percentage for a plan with no allowance", async () => {
    mocks.getWorkspaceBilling.mockResolvedValue({ plan: { slug: "none" } });
    const result = await thresholds(500_000_000);
    expect(result.percentage).toBe(0);
    expect(result.limitMicros).toBe(0);
    expect(result.warningThreshold).toBe(false);
  });

  it("falls back to the free plan when the workspace has none", async () => {
    mocks.getWorkspaceBilling.mockResolvedValue({ plan: null });
    const result = await thresholds(1_000_000_000);
    expect(result.limitMicros).toBe(2_000_000_000);
    expect(result.percentage).toBe(50);
  });
});
