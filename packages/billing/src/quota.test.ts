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

/**
 * The error class admission narrows on with `instanceof`, hoisted
 * because `vi.mock` factories run before the module body. A stub
 * declared below would be unreachable from the factory, and a
 * different class than the one under test would make the branch
 * untestable in exactly the way that matters.
 */
const pricing = vi.hoisted(() => {
  class UnknownModelError extends Error {
    readonly code = "unknown_model";
    readonly modelId: string;
    constructor(modelId: string) {
      super(`No price registered for model "${modelId}".`);
      this.name = "UnknownModelError";
      this.modelId = modelId;
    }
  }
  return { UnknownModelError };
});

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
vi.mock("./quota-plan", async () => {
  const { BillingNotConfiguredError } =
    await import("./plan-registry");
  return {
    // free plan: 2000₮ monthly allowance; "unconfigured" simulates a
    // deployment whose composition root never registered a product.
    getPlanMonthlyCreditMnt: (slug: string) => {
      if (slug === "unconfigured") throw new BillingNotConfiguredError();
      return slug === "free" ? 2000 : 30000;
    },
    getPlanMessageLimit: () => 100,
  };
});
vi.mock("@intelligo-dev/executions/pricing", () => ({
  estimateWorstCaseChargedMnt: mocks.estimateWorstCaseChargedMnt,
  calculateChargedMnt: mocks.calculateChargedMnt,
  calculateCost: mocks.calculateCost,
  UnknownModelError: pricing.UnknownModelError,
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

import { checkQuota, estimateQuota, reserveQuota } from "./quota";
import { db } from "@intelligo-dev/core/db";

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

describe("a model with no registered price", () => {
  it("refuses with a code instead of throwing", async () => {
    // The transport turns a refusal into a 402 that says why. An
    // uncaught throw here would be a 500 on a deployment whose only
    // mistake was not registering a model — and the request would look
    // like an outage rather than a configuration error.
    mocks.estimateWorstCaseChargedMnt.mockImplementationOnce(() => {
      throw new pricing.UnknownModelError("bedrock/llama-4-70b");
    });

    const r = await estimateQuota("ws-1", { modelId: "bedrock/llama-4-70b" });

    expect(r.allowed).toBe(false);
    expect(r.code).toBe("unknown_model");
    expect(r.reason).toContain("bedrock/llama-4-70b");
  });

  it("does not reserve credit for a request it cannot price", async () => {
    mocks.estimateWorstCaseChargedMnt.mockImplementationOnce(() => {
      throw new pricing.UnknownModelError("bedrock/llama-4-70b");
    });

    const r = await reserveQuota("ws-1", {
      modelId: "bedrock/llama-4-70b",
      requestId: "req-unpriceable",
    });

    expect(r.allowed).toBe(false);
    expect(store.reservations).toHaveLength(0);
  });
});

describe("estimateQuota / reserveQuota", () => {
  it("estimateQuota never opens a transaction or reserves", async () => {
    vi.mocked(db.transaction).mockClear();
    const r = await estimateQuota("ws-1", {
      modelId: "google/gemini-2.5-flash",
    });
    expect(r.allowed).toBe(true);
    expect("reservedRequestId" in r).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(store.reservations).toHaveLength(0);
  });

  it("reserveQuota returns the reservation id it created", async () => {
    const r = await reserveQuota("ws-1", {
      modelId: "google/gemini-2.5-flash",
      requestId: "req-reserve-1",
    });
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.reservedRequestId).toBe("req-reserve-1");
    expect(store.reservations.map((x) => x.requestId)).toEqual([
      "req-reserve-1",
    ]);
  });

  it("reserveQuota refuses to run without a requestId", async () => {
    await expect(
      reserveQuota("ws-1", { requestId: "" as string })
    ).rejects.toThrow(/requestId/);
  });

  it("codes a refusal: insufficient_credits when something remains", async () => {
    // 2000₮ allowance, 300₮ used → 1700 left; estimate 2000 → refused.
    mocks.getCurrentMonthlyUsage.mockResolvedValue({ chargedMnt: 300 });
    mocks.estimateWorstCaseChargedMnt.mockReturnValue(2000);
    const r = await reserveQuota("ws-1", { requestId: "req-code-1" });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("insufficient_credits");
  });

  it("codes a refusal: allowance_depleted when nothing remains", async () => {
    mocks.getCurrentMonthlyUsage.mockResolvedValue({ chargedMnt: 2000 });
    const r = await reserveQuota("ws-1", { requestId: "req-code-2" });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("allowance_depleted");
  });

  it("refuses with billing_not_configured instead of throwing when no product is registered", async () => {
    mocks.getWorkspaceBilling.mockResolvedValue({
      plan: { slug: "unconfigured" },
      creditBalance: { balanceMnt: 0 },
    });
    const r = await reserveQuota("ws-1", { requestId: "req-code-3" });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("billing_not_configured");
    expect(store.reservations).toHaveLength(0);

    const e = await estimateQuota("ws-1");
    expect(e.allowed).toBe(false);
    expect(e.code).toBe("billing_not_configured");
  });
});
