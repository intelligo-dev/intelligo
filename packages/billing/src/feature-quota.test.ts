/**
 * Feature Quota Tests
 *
 * Covers checkFeatureQuota, recordFeatureUsage, and getUserQuotaStats for
 * three quota dimensions (chat, assessment, report) across the
 * free / standard / pro plans.
 *
 * All DB calls are mocked; the tests drive the quota state via a tiny
 * in-memory fake that tracks per-user rows and supports select/update/insert.
 * Plan limits are registered in beforeAll — the framework ships no
 * catalogue to fall back on.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// The upgrade copy comes from a registry the composition root fills at
// boot. Tests don't run the bootstrap, so they register a catalogue of
// their own here.
beforeAll(async () => {
  const {
    registerProductPlans,
    registerUpgradeMessages,
    registerActionLabels,
    registerActionLimitKeys,
    setDefaultProductSlug,
  } = await import("./plan-registry");

  // The engine has no default product: the composition root sets it,
  // and so must a test.
  setDefaultProductSlug("acme");

  // There is no implicit catalogue: a product that registers nothing
  // gets no limits. Registering here is what the composition root does
  // at boot.
  const limits = {
    free: { chatMessages: 30, assessments: 1, reports: 1 },
    standard: { chatMessages: 500, assessments: 3, reports: 5 },
    pro: { chatMessages: 1000, assessments: -1, reports: 5 },
  };
  registerProductPlans("acme", {
    free: {
      name: "Free",
      slug: "free",
      description: "",
      priceOneTime: 0,
      targetAudience: "",
      aiModelLabel: "",
      limits: limits.free,
      features: [],
    },
    standard: {
      name: "Standard",
      slug: "standard",
      description: "",
      priceOneTime: 29_900,
      targetAudience: "",
      aiModelLabel: "",
      limits: limits.standard,
      features: [],
    },
    pro: {
      name: "Pro",
      slug: "pro",
      description: "",
      priceOneTime: 99_000,
      targetAudience: "",
      aiModelLabel: "",
      limits: limits.pro,
      features: [],
    },
  });
  registerUpgradeMessages("acme", {
    free: {
      chat: "Standard unlocks 500 messages",
      assessment: "Standard unlocks 3 detailed assessments",
      report: "Standard unlocks 5 full reports",
    },
    standard: {
      chat: "Pro unlocks 1,000 messages",
      assessment: "Pro unlocks unlimited assessments",
      report: "You have used every report",
    },
    pro: {
      chat: "You have used every message",
      assessment: "",
      report: "You have used every report",
    },
  });
  registerActionLabels("acme", {
    chat: "messages",
    assessment: "assessments",
    report: "reports",
  });
  // This product's plan limits are named differently from its action
  // slugs, so the remap has to be registered too.
  // `invoice_scan` below deliberately registers nothing, which is the
  // path a product that names its limits after its actions takes.
  registerActionLimitKeys("acme", {
    chat: "chatMessages",
    assessment: "assessments",
    report: "reports",
  });
});

// ---------------------------------------------------------------------------
// Hoisted mock state
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  type QuotaRow = {
    userId: string;
    workspaceId: string;
    plan: string;
    usage: Record<string, number>;
    totalCostUsd: number;
  };

  const state: { rows: QuotaRow[] } = { rows: [] };

  const setRow = (row: Partial<QuotaRow> & { userId: string }) => {
    const base: QuotaRow = {
      workspaceId: "ws-1",
      plan: "free",
      usage: {},
      totalCostUsd: 0,
      ...row,
    } as QuotaRow;
    const idx = state.rows.findIndex((r) => r.userId === base.userId);
    if (idx >= 0) state.rows[idx] = { ...state.rows[idx]!, ...base };
    else state.rows.push(base);
  };

  const resetState = () => {
    state.rows = [];
  };

  // Drizzle chain mocks
  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

  const mockInsertValues = vi.fn();
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

  const mockUpdateWhere = vi.fn();
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

  // Track the last eq() so select/update can filter by userId
  let lastWhereUserId: string | null = null;

  return {
    state,
    setRow,
    resetState,
    mockSelect,
    mockSelectFrom,
    mockSelectWhere,
    mockSelectLimit,
    mockInsert,
    mockInsertValues,
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
    getLastWhereUserId: () => lastWhereUserId,
    setLastWhereUserId: (id: string | null) => {
      lastWhereUserId = id;
    },
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@intelligo-dev/core/db", () => ({
  db: {
    select: mocks.mockSelect,
    insert: mocks.mockInsert,
    update: mocks.mockUpdate,
  },
}));

vi.mock("@intelligo-dev/core/db/schema", () => ({
  userQuotas: {
    userId: "userId",
    workspaceId: "workspaceId",
    plan: "plan",
    usage: "usage",
    totalCostUsd: "totalCostUsd",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => {
    // Capture userId for the in-memory fake
    if (col === "userId") mocks.setLastWhereUserId(val as string);
    return { op: "eq", col, val };
  }),
  // A quota row is per (user, workspace), so the
  // module composes its predicates. The fake still keys off the `eq`
  // on `userId`, which `and` receives already evaluated.
  and: vi.fn((...conditions: unknown[]) => ({ op: "and", conditions })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    raw: strings.join("?"),
    values,
  })),
}));

// ---------------------------------------------------------------------------
// Wire in-memory fake responses
// ---------------------------------------------------------------------------

function resetChainMocks() {
  mocks.resetState();
  mocks.setLastWhereUserId(null);

  mocks.mockSelectLimit.mockImplementation(async () => {
    const userId = mocks.getLastWhereUserId();
    const row = mocks.state.rows.find((r) => r.userId === userId);
    return row ? [row] : [];
  });
  mocks.mockSelectWhere.mockReturnValue({ limit: mocks.mockSelectLimit });
  mocks.mockSelectFrom.mockReturnValue({ where: mocks.mockSelectWhere });
  mocks.mockSelect.mockReturnValue({ from: mocks.mockSelectFrom });

  mocks.mockInsertValues.mockImplementation(
    async (row: Record<string, unknown>) => {
      mocks.setRow({
        userId: row.userId as string,
        workspaceId: (row.workspaceId as string) ?? "ws-1",
        plan: (row.plan as string) ?? "free",
      });
      return [];
    }
  );
  mocks.mockInsert.mockReturnValue({ values: mocks.mockInsertValues });

  mocks.mockUpdateWhere.mockImplementation(async () => {
    // updates to plan field only: we just bump lastWhereUserId row
    return [];
  });
  mocks.mockUpdateSet.mockReturnValue({ where: mocks.mockUpdateWhere });
  mocks.mockUpdate.mockReturnValue({ set: mocks.mockUpdateSet });
}

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  checkFeatureQuota,
  recordFeatureUsage,
  getUserQuotaStats,
} from "./feature-quota";
import type { PlanConfig } from "./plans";

// ---------------------------------------------------------------------------
// checkFeatureQuota
// ---------------------------------------------------------------------------

describe("checkFeatureQuota — free plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChainMocks();
  });

  it("allows chat when user is under the 30-message limit", async () => {
    mocks.setRow({ userId: "u1", usage: { chat: 5 } });

    const result = await checkFeatureQuota("u1", "ws-1", "free", "chat");

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(30);
    expect(result.used).toBe(5);
    expect(result.remaining).toBe(25);
  });

  it("denies chat when the 30-message limit is reached", async () => {
    mocks.setRow({ userId: "u1", usage: { chat: 30 } });

    const result = await checkFeatureQuota("u1", "ws-1", "free", "chat");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.upgradeMessage).toContain("Standard");
  });

  it("warns when user reaches 80% usage", async () => {
    mocks.setRow({ userId: "u1", usage: { chat: 24 } }); // 80%

    const result = await checkFeatureQuota("u1", "ws-1", "free", "chat");

    expect(result.allowed).toBe(true);
    expect(result.nearingLimit).toBe(true);
    expect(result.remaining).toBe(6);
  });

  it("denies assessment after 1 use", async () => {
    mocks.setRow({ userId: "u1", usage: { assessment: 1 } });

    const result = await checkFeatureQuota("u1", "ws-1", "free", "assessment");

    expect(result.allowed).toBe(false);
    expect(result.upgradeMessage).toContain("Standard");
  });

  it("denies report after 1 use", async () => {
    mocks.setRow({ userId: "u1", usage: { report: 1 } });

    const result = await checkFeatureQuota("u1", "ws-1", "free", "report");

    expect(result.allowed).toBe(false);
    expect(result.upgradeMessage).toContain("Standard");
  });

  it("creates a quota row for a brand new user", async () => {
    const result = await checkFeatureQuota("new-user", "ws-1", "free", "chat");

    expect(mocks.mockInsert).toHaveBeenCalled();
    // The row has to carry who and where, or the next request reads a
    // quota that belongs to nobody — counters are per (user, workspace).
    expect(mocks.mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "new-user",
        workspaceId: "ws-1",
        plan: "free",
      })
    );
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(0);
  });
});

describe("checkFeatureQuota — standard plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChainMocks();
  });

  it("allows chat up to 500 messages", async () => {
    mocks.setRow({ userId: "u1", plan: "standard", usage: { chat: 499 } });

    const result = await checkFeatureQuota("u1", "ws-1", "standard", "chat");

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(500);
    expect(result.remaining).toBe(1);
  });

  it("denies chat at 500 messages with Pro upgrade message", async () => {
    mocks.setRow({ userId: "u1", plan: "standard", usage: { chat: 500 } });

    const result = await checkFeatureQuota("u1", "ws-1", "standard", "chat");

    expect(result.allowed).toBe(false);
    expect(result.upgradeMessage).toContain("Pro");
  });

  it("allows 3 assessments", async () => {
    mocks.setRow({ userId: "u1", plan: "standard", usage: { assessment: 2 } });

    const result = await checkFeatureQuota(
      "u1",
      "ws-1",
      "standard",
      "assessment"
    );

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(3);
  });
});

describe("checkFeatureQuota — pro plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChainMocks();
  });

  it("treats assessments as unlimited (-1)", async () => {
    mocks.setRow({ userId: "u1", plan: "pro", usage: { assessment: 999 } });

    const result = await checkFeatureQuota("u1", "ws-1", "pro", "assessment");

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(-1);
    expect(result.remaining).toBe(-1);
    expect(result.percentage).toBe(0);
  });

  it("still caps chat at 1,000 messages", async () => {
    mocks.setRow({ userId: "u1", plan: "pro", usage: { chat: 1000 } });

    const result = await checkFeatureQuota("u1", "ws-1", "pro", "chat");

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(1000);
  });

  it("caps reports at 5", async () => {
    mocks.setRow({ userId: "u1", plan: "pro", usage: { report: 5 } });

    const result = await checkFeatureQuota("u1", "ws-1", "pro", "report");

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(5);
  });
});

describe("checkFeatureQuota — unknown plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChainMocks();
  });

  it("falls back to the free plan chat limit for unknown plan slugs", async () => {
    mocks.setRow({ userId: "u1", plan: "legacy", usage: { chat: 0 } });

    const result = await checkFeatureQuota("u1", "ws-1", "legacy", "chat");

    expect(result.limit).toBe(30); // free fallback
  });
});

// ---------------------------------------------------------------------------
// recordFeatureUsage
// ---------------------------------------------------------------------------

describe("the row follows the user's plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChainMocks();
  });

  it("writes the new plan onto a row that still names the old one", async () => {
    // An upgrade changes what the user may do immediately; a row left
    // saying "free" would price the next check against the old plan.
    mocks.setRow({ userId: "u1", plan: "free", usage: { chat: 1 } });

    await checkFeatureQuota("u1", "ws-1", "standard", "chat");

    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "standard" })
    );
  });

  it("writes nothing when the plan has not changed", async () => {
    // Every check would otherwise issue an UPDATE per request.
    mocks.setRow({ userId: "u1", plan: "free", usage: { chat: 1 } });

    await checkFeatureQuota("u1", "ws-1", "free", "chat");

    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });
});

describe("what a check reports back", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChainMocks();
  });

  it("reports the exact share used, not just whether it is near", async () => {
    // The number reaches a progress bar; `used × limit` would fill it
    // at 7,200% and still pass a "nearing the limit" assertion.
    mocks.setRow({ userId: "u2", usage: { chat: 24 } });
    const nearing = await checkFeatureQuota("u2", "ws-1", "free", "chat");
    expect(nearing.percentage).toBe(80);
    expect(nearing.nearingLimit).toBe(true);

    mocks.setRow({ userId: "u3", usage: { chat: 3 } });
    const early = await checkFeatureQuota("u3", "ws-1", "free", "chat");
    expect(early.percentage).toBe(10);
    expect(early.nearingLimit).toBe(false);

    mocks.setRow({ userId: "u4", usage: { chat: 30 } });
    const spent = await checkFeatureQuota("u4", "ws-1", "free", "chat");
    expect(spent.percentage).toBe(100);
    expect(spent.nearingLimit).toBe(true);
  });

  it("reports an unlimited action as not nearing anything", async () => {
    mocks.setRow({ userId: "u1", plan: "pro", usage: { assessment: 9_000 } });

    const result = await checkFeatureQuota("u1", "ws-1", "pro", "assessment");

    expect(result.limit).toBe(-1);
    expect(result.remaining).toBe(-1);
    expect(result.percentage).toBe(0);
    // A bar that fills up on an unlimited plan is a support ticket.
    expect(result.nearingLimit).toBe(false);
  });

  it("falls back to a bare upgrade prompt when the product wrote none", async () => {
    // `invoice_scan` is registered nowhere: no limit key, no copy. It
    // is refused (an unconfigured action is not a free one) and the
    // refusal still has to say something.
    mocks.setRow({ userId: "u1", usage: {} });

    const result = await checkFeatureQuota(
      "u1",
      "ws-1",
      "free",
      "invoice_scan"
    );

    expect(result.limit).toBe(0);
    expect(result.allowed).toBe(false);
    expect(result.upgradeMessage).toBe("Upgrade");
  });

  it("refuses an action the catalogue cannot price", async () => {
    const { registerProductPlans, setDefaultProductSlug } =
      await import("./plan-registry");
    const bare = {
      name: "Pro",
      slug: "pro",
      description: "",
      priceOneTime: 0,
      targetAudience: "",
      aiModelLabel: "",
      // A limit that is not a number is not a limit.
      limits: { chat: "lots" },
      features: [],
    } as unknown as PlanConfig;
    registerProductPlans("bare", { pro: bare });
    setDefaultProductSlug("bare");

    try {
      mocks.setRow({ userId: "u1", usage: {} });
      // No such plan, and no `free` to fall back to.
      const unknownPlan = await checkFeatureQuota("u1", "ws-1", "nope", "chat");
      expect(unknownPlan.limit).toBe(0);
      expect(unknownPlan.allowed).toBe(false);

      const malformed = await checkFeatureQuota("u1", "ws-1", "pro", "chat");
      expect(malformed.limit).toBe(0);
      expect(malformed.allowed).toBe(false);
    } finally {
      setDefaultProductSlug("acme");
    }
  });
});

describe("recordFeatureUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChainMocks();
  });

  it("issues an update on the user_quotas table for chat", async () => {
    await recordFeatureUsage("u1", "ws-1", "chat", 0.05);

    expect(mocks.mockUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.mockUpdateSet).toHaveBeenCalledTimes(1);
    expect(mocks.mockUpdateWhere).toHaveBeenCalledTimes(1);
  });

  it("issues an update for assessment action", async () => {
    await recordFeatureUsage("u1", "ws-1", "assessment");

    expect(mocks.mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("issues an update for report action", async () => {
    await recordFeatureUsage("u1", "ws-1", "report");

    expect(mocks.mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("increments inside the UPDATE rather than in application code", async () => {
    // A read-modify-write in JS loses an increment whenever two
    // requests for the same user overlap; the counter has to be
    // computed by Postgres inside the statement that writes it.
    await recordFeatureUsage("u1", "ws-1", "chat", 0.5);

    const set = mocks.mockUpdateSet.mock.calls[0]![0] as {
      usage: { raw: string; values: unknown[] };
      totalCostUsd: { raw: string; values: unknown[] };
      updatedAt: Date;
    };
    expect(set.usage.raw).toContain("jsonb_build_object");
    expect(set.usage.raw).toContain("COALESCE");
    expect(set.usage.values).toContain("chat");
    expect(set.totalCostUsd.raw).toContain("+");
    expect(set.totalCostUsd.values).toContain(0.5);
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  it("defaults costUsd to 0 when omitted", async () => {
    await expect(
      recordFeatureUsage("u1", "ws-1", "chat")
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getUserQuotaStats
// ---------------------------------------------------------------------------

describe("getUserQuotaStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChainMocks();
  });

  it("returns one result per requested action", async () => {
    mocks.setRow({
      userId: "u1",
      plan: "standard",
      usage: { chat: 100, assessment: 1, report: 0 },
    });

    const stats = await getUserQuotaStats("u1", "ws-1", "standard", [
      "chat",
      "assessment",
      "report",
    ]);

    expect(stats.chat!.limit).toBe(500);
    expect(stats.chat!.used).toBe(100);
    expect(stats.assessment!.limit).toBe(3);
    expect(stats.assessment!.used).toBe(1);
    expect(stats.report!.limit).toBe(5);
    expect(stats.report!.used).toBe(0);
  });

  it("reports an action the product added without a schema change", async () => {
    // A vertical adds a counter by naming it, not by migrating a
    // public package's table.
    mocks.setRow({
      userId: "u2",
      plan: "standard",
      usage: { invoice_scan: 2 },
    });

    const stats = await getUserQuotaStats("u2", "ws-1", "standard", [
      "invoice_scan",
    ]);

    expect(Object.keys(stats)).toEqual(["invoice_scan"]);
    expect(stats.invoice_scan!.used).toBe(2);
  });
});
