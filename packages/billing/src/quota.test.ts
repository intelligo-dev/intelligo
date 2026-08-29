/**
 * quota.ts tests — admission + credit reservation (B-06).
 *
 * checkQuota used to be a pure read while the debit happened minutes
 * later in recordTokenUsage, so N concurrent requests could all pass
 * against the same balance. These tests pin the reservation contract:
 * admission with a requestId subtracts active reservations and inserts
 * its own inside one serialized transaction; settlement flips the
 * reservation to settled.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceBilling: vi.fn(),
  getCurrentMonthlyUsage: vi.fn(),
  hasActiveTrialMnt: vi.fn(),
  getBillingSettings: vi.fn(),
  estimateWorstCaseChargedMnt: vi.fn(),
  calculateChargedMnt: vi.fn(),
  calculateCost: vi.fn(),
  checkNotificationTriggers: vi.fn(),
}));

// In-memory reservation store driving the mocked tx chains.
const store = vi.hoisted(() => ({
  reservations: [] as Array<{
    workspaceId: string;
    requestId: string;
    estimatedMnt: number;
    status: string;
    expiresAt: Date;
  }>,
}));

vi.mock("./queries", () => ({
  getWorkspaceBilling: mocks.getWorkspaceBilling,
}));
vi.mock("./quota-usage", () => ({
  getCurrentMonthlyUsage: mocks.getCurrentMonthlyUsage,
  getCurrentPeriodStart: () => new Date("2026-08-01"),
  getCurrentPeriodEnd: () => new Date("2026-08-31"),
}));
vi.mock("./trial", () => ({
  hasActiveTrialMnt: mocks.hasActiveTrialMnt,
}));
vi.mock("./billing-settings", () => ({
  getBillingSettings: mocks.getBillingSettings,
}));
vi.mock("./notifications", () => ({
  checkNotificationTriggers: mocks.checkNotificationTriggers,
}));
vi.mock("./quota-plan", () => ({
  // free plan: 2000₮ monthly allowance
  getPlanMonthlyCreditMnt: (slug: string) => (slug === "free" ? 2000 : 30000),
  getPlanMessageLimit: () => 100,
}));
vi.mock("@intelligo-dev/executions/pricing", () => ({
  estimateWorstCaseChargedMnt: mocks.estimateWorstCaseChargedMnt,
  calculateChargedMnt: mocks.calculateChargedMnt,
  calculateCost: mocks.calculateCost,
}));

vi.mock("@intelligo-dev/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@intelligo-dev/core/db/schema", () => ({
  usageRecords: {},
  monthlyUsage: {},
  subscriptions: {},
  creditBalances: {},
  trialCredits: {},
  creditReservations: {
    workspaceId: "workspaceId",
    requestId: "requestId",
    estimatedMnt: "estimatedMnt",
    status: "status",
    expiresAt: "expiresAt",
  },
}));

vi.mock("@intelligo-dev/core/db", () => {
  // A minimal tx whose select() sums the in-memory active reservations
  // and whose insert() appends to the store. The advisory lock execute()
  // is a no-op — serialization is simulated by running admissions
  // sequentially inside db.transaction.
  const makeTx = () => ({
    execute: vi.fn(async () => []),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => [
          {
            total: store.reservations
              .filter((r) => r.status === "active" && r.expiresAt > new Date())
              .reduce((sum, r) => sum + r.estimatedMnt, 0),
          },
        ]),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (row: (typeof store.reservations)[number]) => {
        store.reservations.push({ ...row });
      }),
    })),
  });

  // Chain queue guarantees transactions run one at a time, like the
  // pg_advisory_xact_lock would.
  let chain: Promise<unknown> = Promise.resolve();
  return {
    db: {
      transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => {
        const run = chain.then(() => fn(makeTx()));
        chain = run.catch(() => undefined);
        return run;
      }),
    },
  };
});

import { checkQuota } from "./quota";

beforeEach(() => {
  vi.clearAllMocks();
  store.reservations.length = 0;

  mocks.getWorkspaceBilling.mockResolvedValue({
    plan: { slug: "free" },
    creditBalance: { balanceMnt: 0 },
    billingMode: "subscription",
  });
  mocks.getCurrentMonthlyUsage.mockResolvedValue({ chargedMnt: 0 });
  mocks.hasActiveTrialMnt.mockResolvedValue({ active: false, remainingMnt: 0 });
  mocks.getBillingSettings.mockResolvedValue({
    usdToMntRate: 3450,
    marginMultiplier: 4,
  });
  // Worst-case estimate: 1500₮ — the 2000₮ free allowance fits exactly one.
  mocks.estimateWorstCaseChargedMnt.mockReturnValue(1500);
});

describe("checkQuota — read-only mode (no requestId)", () => {
  it("allows when the plan allowance covers the estimate", async () => {
    const result = await checkQuota("ws-1", { modelId: "m" });

    expect(result.allowed).toBe(true);
    expect(result.reservedRequestId).toBeUndefined();
    expect(store.reservations).toHaveLength(0);
  });

  it("refuses when the allowance is depleted", async () => {
    mocks.getCurrentMonthlyUsage.mockResolvedValue({ chargedMnt: 2000 });

    const result = await checkQuota("ws-1", { modelId: "m" });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("depleted");
  });

  it("falls back to trial credits when non-trial funds are short", async () => {
    mocks.getCurrentMonthlyUsage.mockResolvedValue({ chargedMnt: 2000 });
    mocks.hasActiveTrialMnt.mockResolvedValue({
      active: true,
      remainingMnt: 5000,
    });

    const result = await checkQuota("ws-1", { modelId: "m" });

    expect(result.allowed).toBe(true);
    expect(result.usingTrialCredits).toBe(true);
  });
});

describe("checkQuota — reserving mode (with requestId)", () => {
  it("inserts a reservation on admission", async () => {
    const result = await checkQuota("ws-1", {
      modelId: "m",
      requestId: "req-1",
    });

    expect(result.allowed).toBe(true);
    expect(result.reservedRequestId).toBe("req-1");
    expect(store.reservations).toHaveLength(1);
    expect(store.reservations[0]).toMatchObject({
      workspaceId: "ws-1",
      requestId: "req-1",
      estimatedMnt: 1500,
      status: "active",
    });
    expect(store.reservations[0]!.expiresAt.getTime()).toBeGreaterThan(
      Date.now()
    );
  });

  it("admits exactly one of two concurrent requests when balance fits one", async () => {
    // Allowance 2000₮, estimate 1500₮ each: the first reservation leaves
    // 500₮ — not enough for the second.
    const [a, b] = await Promise.all([
      checkQuota("ws-1", { modelId: "m", requestId: "req-a" }),
      checkQuota("ws-1", { modelId: "m", requestId: "req-b" }),
    ]);

    const admitted = [a, b].filter((r) => r.allowed);
    expect(admitted).toHaveLength(1);
    expect(store.reservations).toHaveLength(1);
  });

  it("counts existing active reservations against admission", async () => {
    store.reservations.push({
      workspaceId: "ws-1",
      requestId: "req-existing",
      estimatedMnt: 1500,
      status: "active",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await checkQuota("ws-1", {
      modelId: "m",
      requestId: "req-2",
    });

    expect(result.allowed).toBe(false);
    expect(store.reservations).toHaveLength(1); // no new reservation
  });

  it("ignores expired reservations", async () => {
    store.reservations.push({
      workspaceId: "ws-1",
      requestId: "req-old",
      estimatedMnt: 1500,
      status: "active",
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await checkQuota("ws-1", {
      modelId: "m",
      requestId: "req-3",
    });

    expect(result.allowed).toBe(true);
  });

  it("ignores settled reservations", async () => {
    store.reservations.push({
      workspaceId: "ws-1",
      requestId: "req-done",
      estimatedMnt: 1500,
      status: "settled",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await checkQuota("ws-1", {
      modelId: "m",
      requestId: "req-4",
    });

    expect(result.allowed).toBe(true);
  });

  it("does not reserve when admission is refused", async () => {
    mocks.getCurrentMonthlyUsage.mockResolvedValue({ chargedMnt: 2000 });

    const result = await checkQuota("ws-1", {
      modelId: "m",
      requestId: "req-5",
    });

    expect(result.allowed).toBe(false);
    expect(store.reservations).toHaveLength(0);
  });

  it("reserves against the trial pool when trial credits admit the request", async () => {
    mocks.getCurrentMonthlyUsage.mockResolvedValue({ chargedMnt: 2000 });
    mocks.hasActiveTrialMnt.mockResolvedValue({
      active: true,
      remainingMnt: 1600,
    });

    const first = await checkQuota("ws-1", {
      modelId: "m",
      requestId: "trial-a",
    });
    const second = await checkQuota("ws-1", {
      modelId: "m",
      requestId: "trial-b",
    });

    expect(first.allowed).toBe(true);
    expect(first.usingTrialCredits).toBe(true);
    // 1600₮ trial fits one 1500₮ reservation, not two.
    expect(second.allowed).toBe(false);
  });
});
