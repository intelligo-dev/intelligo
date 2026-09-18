/**
 * recordTokenUsage — one charge, one debit.
 *
 * Admission sums three pools (plan allowance, top-up, trial). A
 * settlement that increments the monthly counter *and* decrements a
 * balance for the same charge counts it twice, and the workspace loses
 * 2× per turn whenever two pools are non-zero. These tests pin the
 * order — allowance first, then exactly one of trial / top-up for the
 * remainder — the reservation settlement, and that the whole thing
 * runs under the per-workspace advisory lock admission uses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceBilling: vi.fn(),
  getBillingSettings: vi.fn(),
  chargeFor: vi.fn(),
  checkNotificationTriggers: vi.fn(),
}));

/**
 * The rows the mocked transaction sees, and what it wrote. Micros of
 * the billing currency.
 */
const state = vi.hoisted(() => ({
  /** null = no monthly_usage row yet for this period. */
  allowanceUsedMicros: null as number | null,
  /** null = no active trial row. */
  trialRemainingMicros: null as number | null,
  log: [] as string[],
}));

vi.mock("./queries", () => ({
  getWorkspaceBilling: mocks.getWorkspaceBilling,
}));
vi.mock("./quota-usage", () => ({
  getCurrentMonthlyUsage: vi.fn(),
  getCurrentPeriodStart: () => new Date("2026-08-01"),
  getCurrentPeriodEnd: () => new Date("2026-08-31"),
}));
vi.mock("./trial", () => ({ getActiveTrialGrant: vi.fn() }));
vi.mock("./billing-settings", () => ({
  getBillingSettings: mocks.getBillingSettings,
}));
vi.mock("./notifications", () => ({
  checkNotificationTriggers: mocks.checkNotificationTriggers,
}));
vi.mock("./quota-plan", async () => {
  const { money } = await import("@intelligo-dev/core/money");
  return {
    // free plan: a 2000₮ monthly allowance, in micros.
    getPlanMonthlyAllowance: (slug: string, currency: string) =>
      money((slug === "free" ? 2000 : 30000) * 1_000_000, currency),
    getPlanMessageLimit: () => 100,
  };
});
vi.mock("@intelligo-dev/executions/pricing", () => ({
  estimateWorstCaseCharge: vi.fn(),
  chargeFor: mocks.chargeFor,
}));
vi.mock("@intelligo-dev/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Tables are identified by name so the fake transaction can answer
// each select from `state` and record each write.
vi.mock("@intelligo-dev/core/db/schema", () => {
  const table = (name: string, cols: string[]) =>
    Object.fromEntries([
      ["__name", name],
      ...cols.map((c) => [c, `${name}.${c}`]),
    ]);
  return {
    usageRecords: table("usage_records", []),
    monthlyUsage: table("monthly_usage", [
      "workspaceId",
      "periodStart",
      "tokensUsed",
      "allowanceUsedMicros",
      "requestCount",
    ]),
    creditBalances: table("credit_balances", [
      "workspaceId",
      "balanceMicros",
      "totalUsedMicros",
    ]),
    trialCredits: table("trial_credits", [
      "workspaceId",
      "status",
      "remainingMicros",
      "usedMicros",
      "creditsRemaining",
      "creditsUsed",
      "depletedAt",
    ]),
    creditReservations: table("credit_reservations", [
      "workspaceId",
      "requestId",
      "status",
    ]),
    subscriptions: table("subscriptions", []),
  };
});

vi.mock("@intelligo-dev/core/db", () => {
  type Table = { __name: string };
  const rowsFor = (t: Table) => {
    if (t.__name === "monthly_usage") {
      return state.allowanceUsedMicros === null
        ? []
        : [{ allowanceUsedMicros: state.allowanceUsedMicros }];
    }
    if (t.__name === "trial_credits") {
      return state.trialRemainingMicros === null
        ? []
        : [{ remainingMicros: state.trialRemainingMicros }];
    }
    return [];
  };
  const makeTx = () => ({
    execute: vi.fn(async () => {
      state.log.push("execute");
      return [];
    }),
    insert: vi.fn((t: Table) => ({
      values: vi.fn(() => {
        state.log.push(`insert ${t.__name}`);
        const done = Promise.resolve();
        return Object.assign(done, {
          onConflictDoNothing: async () => {
            if (
              t.__name === "monthly_usage" &&
              state.allowanceUsedMicros === null
            ) {
              state.allowanceUsedMicros = 0;
            }
          },
          onConflictDoUpdate: async () => {},
        });
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn((t: Table) => ({
        where: vi.fn(() => ({
          for: vi.fn(() => ({
            limit: vi.fn(async () => rowsFor(t)),
          })),
        })),
      })),
    })),
    update: vi.fn((t: Table) => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => {
          state.log.push(`update ${t.__name}`);
        }),
      })),
    })),
  });
  return {
    db: {
      transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn(makeTx())
      ),
    },
  };
});

import { money, zero } from "@intelligo-dev/core/money";

import { recordTokenUsage } from "./quota";

/** 500₮, the charge every test here settles, in micros. */
const CHARGED = money(500_000_000, "MNT");
/** A share of that charge, for the pool split. */
const mnt = (amount: number) => money(amount * 1_000_000, "MNT");

const settle = (over: Partial<Parameters<typeof recordTokenUsage>[0]> = {}) =>
  recordTokenUsage({
    workspaceId: "ws",
    userId: "u",
    model: "openai/gpt-5-mini",
    agent: "chat.message",
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    requestId: "req-1",
    ...over,
  });

const updates = () => state.log.filter((l) => l.startsWith("update "));

beforeEach(() => {
  vi.clearAllMocks();
  state.allowanceUsedMicros = null;
  state.trialRemainingMicros = null;
  state.log = [];
  mocks.getWorkspaceBilling.mockResolvedValue({ plan: { slug: "free" } });
  mocks.getBillingSettings.mockResolvedValue({
    currency: "MNT",
    usdRateMicros: 3_450_000_000,
    marginBp: 40_000,
  });
  mocks.chargeFor.mockReturnValue({
    providerCost: money(50_000, "USD"),
    charged: CHARGED,
  });
  mocks.checkNotificationTriggers.mockResolvedValue(undefined);
});

describe("recordTokenUsage", () => {
  it("funds the whole charge from the plan allowance when it fits", async () => {
    const out = await settle();
    expect(out).toEqual({
      charged: CHARGED,
      plan: CHARGED,
      topup: zero("MNT"),
      trial: zero("MNT"),
    });
    expect(updates()).toEqual([
      "update monthly_usage",
      "update credit_reservations",
    ]);
  });

  it("splits a charge that straddles the end of the allowance", async () => {
    state.allowanceUsedMicros = mnt(1800).amount; // 200₮ of 2000₮ left
    const out = await settle();
    expect(out).toEqual({
      charged: CHARGED,
      plan: mnt(200),
      topup: mnt(300),
      trial: zero("MNT"),
    });
    expect(updates()).toEqual([
      "update monthly_usage",
      "update credit_balances",
      "update credit_reservations",
    ]);
  });

  it("debits only the top-up balance once the allowance is exhausted", async () => {
    state.allowanceUsedMicros = mnt(2000).amount;
    const out = await settle();
    expect(out).toEqual({
      charged: CHARGED,
      plan: zero("MNT"),
      topup: CHARGED,
      trial: zero("MNT"),
    });
    expect(updates()).toContain("update credit_balances");
    expect(updates()).not.toContain("update trial_credits");
  });

  it("debits the trial grant instead when admitted on trial credits and it still covers the remainder", async () => {
    state.allowanceUsedMicros = mnt(2000).amount;
    state.trialRemainingMicros = mnt(1000).amount;
    const out = await settle({ usingTrialCredits: true });
    expect(out).toEqual({
      charged: CHARGED,
      plan: zero("MNT"),
      topup: zero("MNT"),
      trial: CHARGED,
    });
    expect(updates()).toContain("update trial_credits");
    expect(updates()).not.toContain("update credit_balances");
  });

  it("falls back to the top-up balance when the trial no longer covers the remainder", async () => {
    state.allowanceUsedMicros = mnt(2000).amount;
    state.trialRemainingMicros = mnt(100).amount;
    const out = await settle({ usingTrialCredits: true });
    expect(out.trial).toEqual(zero("MNT"));
    expect(out.topup).toEqual(CHARGED);
    expect(updates()).toContain("update credit_balances");
    expect(updates()).not.toContain("update trial_credits");
  });

  it("never touches a balance for a charge the allowance covered", async () => {
    state.trialRemainingMicros = mnt(5000).amount;
    await settle({ usingTrialCredits: true });
    expect(updates()).not.toContain("update trial_credits");
    expect(updates()).not.toContain("update credit_balances");
  });

  it("takes the workspace advisory lock before writing anything", async () => {
    await settle();
    expect(state.log[0]).toBe("execute");
    expect(state.log.indexOf("insert usage_records")).toBeGreaterThan(0);
  });

  it("settles the reservation only when a requestId is known", async () => {
    await settle({ requestId: undefined, metadata: {} });
    expect(updates()).not.toContain("update credit_reservations");
    state.log = [];
    await settle({
      requestId: undefined,
      metadata: { requestId: "from-meta" },
    });
    expect(updates()).toContain("update credit_reservations");
  });
});
