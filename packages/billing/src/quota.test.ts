/**
 * quota.ts tests — admission + credit reservation.
 *
 * Without a reservation, N concurrent requests could all pass against
 * the same balance. These tests pin the reservation contract:
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
  getActiveTrialGrant: vi.fn(),
  getBillingSettings: vi.fn(),
  estimateWorstCaseCharge: vi.fn(),
  chargeFor: vi.fn(),
  checkNotificationTriggers: vi.fn(),
  warnDeprecated: vi.fn(),
}));

// In-memory reservation store driving the mocked tx chains.
const store = vi.hoisted(() => ({
  reservations: [] as Array<{
    id?: string;
    workspaceId: string;
    requestId: string;
    estimatedMicros: number;
    status: string;
    expiresAt: Date;
  }>,
}));

/**
 * The conditions and arithmetic the reservation queries build, as data
 * the in-memory store can evaluate: `eq`, `gt` and `and` filter rows,
 * and `sql` keeps its pieces so `column + n` can be applied.
 */
type Condition =
  | { op: "eq" | "gt"; col: string; val: unknown }
  | { op: "and"; args: Array<Condition | undefined> };
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (col: string, val: unknown) => ({ op: "eq", col, val }),
    gt: (col: string, val: unknown) => ({ op: "gt", col, val }),
    and: (...args: unknown[]) => ({ op: "and", args }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: "sql",
      strings: [...strings],
      values,
    }),
  };
});

const query = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const matches = (row: Row, cond: Condition | undefined): boolean => {
    if (!cond) return true;
    if (cond.op === "and") return cond.args.every((c) => matches(row, c));
    const value = row[cond.col] as number | Date | string;
    return cond.op === "eq"
      ? value === cond.val
      : value > (cond.val as number | Date | string);
  };
  /** `column + n`, as `sql` above records it. */
  const apply = (row: Row, key: string, value: unknown) => {
    const piece = value as { op?: string; values?: unknown[] };
    row[key] =
      piece?.op === "sql"
        ? (row[key] as number) + (piece.values![1] as number)
        : value;
  };
  return { matches, apply };
});

vi.mock("./queries", () => ({
  getWorkspaceBilling: mocks.getWorkspaceBilling,
}));
vi.mock("./quota-usage", () => ({
  getCurrentMonthlyUsage: mocks.getCurrentMonthlyUsage,
  getCurrentPeriodStart: () => new Date("2026-08-01"),
  getCurrentPeriodEnd: () => new Date("2026-08-31"),
}));
vi.mock("./trial", () => ({
  getActiveTrialGrant: mocks.getActiveTrialGrant,
}));
vi.mock("./billing-settings", () => ({
  getBillingSettings: mocks.getBillingSettings,
}));
vi.mock("./notifications", () => ({
  checkNotificationTriggers: mocks.checkNotificationTriggers,
}));
// Mocked so the once-per-process memory cannot hide a later case's call.
vi.mock("./deprecation", () => ({
  warnDeprecated: mocks.warnDeprecated,
}));
vi.mock("./quota-plan", async () => {
  const { BillingNotConfiguredError } = await import("./plan-registry");
  const { money } = await import("@intelligo-dev/core/money");
  return {
    // free plan: 2000₮ monthly allowance; "unconfigured" simulates a
    // deployment whose composition root never registered a product.
    getPlanMonthlyAllowance: (slug: string, currency: string) => {
      if (slug === "unconfigured") throw new BillingNotConfiguredError();
      return money((slug === "free" ? 2000 : 30000) * 1_000_000, currency);
    },
    getPlanMessageLimit: () => 100,
  };
});
vi.mock("@intelligo-dev/executions/pricing", () => ({
  estimateWorstCaseCharge: mocks.estimateWorstCaseCharge,
  chargeFor: mocks.chargeFor,
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
    id: "id",
    workspaceId: "workspaceId",
    requestId: "requestId",
    estimatedMicros: "estimatedMicros",
    status: "status",
    expiresAt: "expiresAt",
  },
}));

vi.mock("@intelligo-dev/core/db", () => {
  type Row = Record<string, unknown>;
  const rows = () => store.reservations as unknown as Row[];
  // select() reads the in-memory reservations a condition matches: their
  // sum for a `total`, or the rows themselves; insert() appends and
  // update() writes the matching rows. The advisory lock execute() is a
  // no-op — serialization is simulated by running admissions
  // sequentially inside db.transaction.
  const select = vi.fn((selection: Record<string, unknown>) => ({
    from: vi.fn(() => ({
      where: vi.fn((cond: Condition) => {
        const found = rows().filter((r) => query.matches(r, cond));
        const result =
          "total" in selection
            ? [
                {
                  total: found.reduce(
                    (sum, r) => sum + (r.estimatedMicros as number),
                    0
                  ),
                },
              ]
            : found.map((r) => ({ id: r.id }));
        return Object.assign(Promise.resolve(result), {
          limit: async (n: number) => result.slice(0, n),
        });
      }),
    })),
  }));
  const update = vi.fn(() => ({
    set: (fields: Row) => ({
      where: async (cond: Condition) => {
        for (const row of rows().filter((r) => query.matches(r, cond))) {
          for (const [key, value] of Object.entries(fields)) {
            query.apply(row, key, value);
          }
        }
      },
    }),
  }));
  const makeTx = () => ({
    execute: vi.fn(async () => []),
    select,
    insert: vi.fn(() => ({
      values: vi.fn(async (row: (typeof store.reservations)[number]) => {
        store.reservations.push({ ...row });
      }),
    })),
    update,
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
      update,
    },
  };
});

import { money } from "@intelligo-dev/core/money";

import {
  checkQuota,
  estimateQuota,
  extendReservation,
  releaseReservation,
  reserveQuota,
} from "./quota";
import { db } from "@intelligo-dev/core/db";

beforeEach(() => {
  vi.clearAllMocks();
  store.reservations.length = 0;

  mocks.getWorkspaceBilling.mockResolvedValue({
    plan: { slug: "free" },
    creditBalance: { balanceMicros: 0, currency: "MNT" },
    billingMode: "subscription",
  });
  mocks.getCurrentMonthlyUsage.mockResolvedValue({
    allowanceUsedMicros: 0,
    currency: "MNT",
  });
  mocks.getActiveTrialGrant.mockResolvedValue({
    active: false,
    remainingMicros: 0,
    currency: null,
  });
  mocks.getBillingSettings.mockResolvedValue({
    currency: "MNT",
    usdRateMicros: 3_450_000_000,
    marginBp: 40_000,
  });
  // Worst-case ceiling: 1500₮ in micros — the 2000₮ free allowance
  // fits exactly one.
  mocks.estimateWorstCaseCharge.mockReturnValue(money(1_500_000_000, "MNT"));
});

describe("checkQuota — read-only mode (no requestId)", () => {
  it("allows when the plan allowance covers the estimate", async () => {
    const result = await checkQuota("ws-1", { modelId: "m" });

    expect(result.allowed).toBe(true);
    expect(result.reservedRequestId).toBeUndefined();
    expect(store.reservations).toHaveLength(0);
  });

  it("refuses when the allowance is depleted", async () => {
    mocks.getCurrentMonthlyUsage.mockResolvedValue({
      allowanceUsedMicros: 2_000_000_000,
      currency: "MNT",
    });

    const result = await checkQuota("ws-1", { modelId: "m" });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("depleted");
  });

  it("falls back to trial credits when non-trial funds are short", async () => {
    mocks.getCurrentMonthlyUsage.mockResolvedValue({
      allowanceUsedMicros: 2_000_000_000,
      currency: "MNT",
    });
    mocks.getActiveTrialGrant.mockResolvedValue({
      active: true,
      remainingMicros: 5_000_000_000,
      currency: "MNT",
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
      estimatedMicros: 1_500_000_000,
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
      estimatedMicros: 1_500_000_000,
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
      estimatedMicros: 1_500_000_000,
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
      estimatedMicros: 1_500_000_000,
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
    mocks.getCurrentMonthlyUsage.mockResolvedValue({
      allowanceUsedMicros: 2_000_000_000,
      currency: "MNT",
    });

    const result = await checkQuota("ws-1", {
      modelId: "m",
      requestId: "req-5",
    });

    expect(result.allowed).toBe(false);
    expect(store.reservations).toHaveLength(0);
  });

  it("reserves against the trial pool when trial credits admit the request", async () => {
    mocks.getCurrentMonthlyUsage.mockResolvedValue({
      allowanceUsedMicros: 2_000_000_000,
      currency: "MNT",
    });
    mocks.getActiveTrialGrant.mockResolvedValue({
      active: true,
      remainingMicros: 1_600_000_000,
      currency: "MNT",
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
    mocks.estimateWorstCaseCharge.mockImplementationOnce(() => {
      throw new pricing.UnknownModelError("bedrock/llama-4-70b");
    });

    const r = await estimateQuota("ws-1", { modelId: "bedrock/llama-4-70b" });

    expect(r.allowed).toBe(false);
    expect(r.code).toBe("unknown_model");
    expect(r.reason).toContain("bedrock/llama-4-70b");
  });

  it("does not reserve credit for a request it cannot price", async () => {
    mocks.estimateWorstCaseCharge.mockImplementationOnce(() => {
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

describe("checkQuota is deprecated", () => {
  it("warns with INTELLIGO_DEP0001 in either mode", async () => {
    await checkQuota("ws-1", { modelId: "m" });
    await checkQuota("ws-1", { modelId: "m", requestId: "req-dep" });

    expect(mocks.warnDeprecated).toHaveBeenCalledTimes(2);
    for (const [code, message] of mocks.warnDeprecated.mock.calls) {
      expect(code).toBe("INTELLIGO_DEP0001");
      expect(message).toMatch(/reserveQuota.*estimateQuota/);
    }
  });

  it("does not warn from estimateQuota or reserveQuota", async () => {
    await estimateQuota("ws-1", { modelId: "m" });
    await reserveQuota("ws-1", { modelId: "m", requestId: "req-new" });

    expect(mocks.warnDeprecated).not.toHaveBeenCalled();
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
    mocks.getCurrentMonthlyUsage.mockResolvedValue({
      allowanceUsedMicros: 300_000_000,
      currency: "MNT",
    });
    mocks.estimateWorstCaseCharge.mockReturnValue(money(2_000_000_000, "MNT"));
    const r = await reserveQuota("ws-1", { requestId: "req-code-1" });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("insufficient_credits");
  });

  it("codes a refusal: allowance_depleted when nothing remains", async () => {
    mocks.getCurrentMonthlyUsage.mockResolvedValue({
      allowanceUsedMicros: 2_000_000_000,
      currency: "MNT",
    });
    const r = await reserveQuota("ws-1", { requestId: "req-code-2" });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("allowance_depleted");
  });

  it("refuses with billing_not_configured instead of throwing when no product is registered", async () => {
    mocks.getWorkspaceBilling.mockResolvedValue({
      plan: { slug: "unconfigured" },
      creditBalance: { balanceMicros: 0, currency: "MNT" },
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

describe("extendReservation", () => {
  const STEP = money(400_000_000, "MNT");
  const active = () =>
    store.reservations
      .filter((r) => r.status === "active")
      .reduce((sum, r) => sum + r.estimatedMicros, 0);

  beforeEach(() => {
    // One step of a tool loop: 400₮. The 2000₮ allowance fits five.
    mocks.estimateWorstCaseCharge.mockReturnValue(STEP);
  });

  it("grows the request's own reservation while the allowance covers it", async () => {
    const workload = { inputTokens: 3_000, steps: 1, outputTokens: 1_024 };
    await reserveQuota("ws-1", { modelId: "m", requestId: "req-1" });

    const r = await extendReservation("ws-1", {
      modelId: "m",
      workload,
      requestId: "req-1",
    });

    expect(r).toMatchObject({ allowed: true, estimated: STEP });
    expect(mocks.estimateWorstCaseCharge).toHaveBeenLastCalledWith(
      "m",
      expect.objectContaining({ currency: "MNT" }),
      workload
    );
    expect(store.reservations).toHaveLength(1);
    expect(store.reservations[0]!.estimatedMicros).toBe(800_000_000);
  });

  it("refuses the step that would exceed the allowance and holds nothing more", async () => {
    await reserveQuota("ws-1", { modelId: "m", requestId: "req-1" });
    // 400 held + four more steps = 2000₮, the whole allowance.
    for (let step = 0; step < 4; step++) {
      const r = await extendReservation("ws-1", {
        modelId: "m",
        requestId: "req-1",
      });
      expect(r.allowed).toBe(true);
    }

    const refused = await extendReservation("ws-1", {
      modelId: "m",
      requestId: "req-1",
    });

    expect(refused).toMatchObject({
      allowed: false,
      code: "insufficient_credits",
    });
    expect(active()).toBe(2_000_000_000);
  });

  it("counts other requests' reservations against the extension", async () => {
    await reserveQuota("ws-1", { modelId: "m", requestId: "req-1" });
    // Another turn of the same workspace holds 1500₮.
    store.reservations.push({
      id: "other",
      workspaceId: "ws-1",
      requestId: "req-other",
      estimatedMicros: 1_500_000_000,
      status: "active",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const r = await extendReservation("ws-1", {
      modelId: "m",
      requestId: "req-1",
    });

    // 400 + 1500 held, 100 left: a 400₮ step does not fit.
    expect(r.allowed).toBe(false);
    expect(
      store.reservations.find((x) => x.requestId === "req-1")
    ).toMatchObject({ estimatedMicros: 400_000_000 });
  });

  it("admits one of two concurrent extensions when the balance fits one", async () => {
    // 1500₮ admitted; 500₮ left fits one more 400₮ step, not two.
    mocks.estimateWorstCaseCharge.mockReturnValueOnce(
      money(1_500_000_000, "MNT")
    );
    await reserveQuota("ws-1", { modelId: "m", requestId: "req-1" });
    mocks.estimateWorstCaseCharge.mockReturnValueOnce(
      money(100_000_000, "MNT")
    );
    await reserveQuota("ws-1", { modelId: "m", requestId: "req-2" });

    const [a, b] = await Promise.all([
      extendReservation("ws-1", { modelId: "m", requestId: "req-1" }),
      extendReservation("ws-1", { modelId: "m", requestId: "req-2" }),
    ]);

    expect([a, b].filter((r) => r.allowed)).toHaveLength(1);
    expect(active()).toBe(2_000_000_000);
  });

  it("refuses a request whose reservation is no longer active", async () => {
    await reserveQuota("ws-1", { modelId: "m", requestId: "req-1" });
    await releaseReservation("req-1", "ws-1");

    const released = await extendReservation("ws-1", {
      modelId: "m",
      requestId: "req-1",
    });
    const unknown = await extendReservation("ws-1", {
      modelId: "m",
      requestId: "req-never",
    });

    expect(released).toMatchObject({
      allowed: false,
      code: "hold_not_active",
    });
    expect(unknown).toMatchObject({ allowed: false, code: "hold_not_active" });
    expect(store.reservations).toHaveLength(1);
    expect(store.reservations[0]!.estimatedMicros).toBe(400_000_000);
  });

  it("is released whole with the reservation it grew", async () => {
    await reserveQuota("ws-1", { modelId: "m", requestId: "req-1" });
    await extendReservation("ws-1", { modelId: "m", requestId: "req-1" });
    expect(active()).toBe(800_000_000);

    await releaseReservation("req-1", "ws-1");

    expect(active()).toBe(0);
    // The next turn is admitted against the whole allowance again.
    const next = await reserveQuota("ws-1", {
      modelId: "m",
      requestId: "req-2",
    });
    expect(next.allowed).toBe(true);
  });

  it("refuses with billing_not_configured instead of throwing", async () => {
    await reserveQuota("ws-1", { modelId: "m", requestId: "req-1" });
    mocks.getWorkspaceBilling.mockResolvedValue({
      plan: { slug: "unconfigured" },
      creditBalance: { balanceMicros: 0, currency: "MNT" },
    });

    const r = await extendReservation("ws-1", {
      modelId: "m",
      requestId: "req-1",
    });

    expect(r).toMatchObject({
      allowed: false,
      code: "billing_not_configured",
    });
  });
});
