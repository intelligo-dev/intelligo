/**
 * Feature Quota Tests
 *
 * Covers checkFeatureQuota, recordFeatureUsage, and getUserQuotaStats for
 * the three Support Assistant quota dimensions (chat, assessment, report)
 * across the free / standard / pro plans.
 *
 * All DB calls are mocked; the tests drive the quota state via a tiny
 * in-memory fake that tracks per-user rows and supports select/update/insert.
 * Plan limits are registered in beforeAll — billing-core no longer ships
 * a support catalogue to fall back on (ADR-0006).
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// Wave 4 of the architecture decoupling moved the upgrade copy out
// of feature-quota.ts and into a registry that the support package
// fills at server bootstrap. Tests don't run the bootstrap, so we
// register the same data here. The fixture is a duplicate of
// CAREER_UPGRADE_MESSAGES / CAREER_ACTION_LABELS in
// the vertical package's plan configuration; if those drift the test
// breaks loudly.
beforeAll(async () => {
  const {
    registerProductPlans,
    registerUpgradeMessages,
    registerActionLabels,
    registerActionLimitKeys,
    setDefaultProductSlug,
  } = await import("./plan-registry");

  // The engine has no built-in default product any more — the
  // composition root sets it, and so must a test.
  setDefaultProductSlug("support");

  // Phase 3 removed the built-in support catalogue from billing-core, so
  // there is no implicit fallback any more: a product that registers
  // nothing gets no limits. Registering here is the same thing the
  // composition root does at boot, and it keeps this fixture the only
  // place the numbers live for these tests.
  const limits = {
    free: { chatMessages: 30, assessments: 1, reports: 1 },
    standard: { chatMessages: 500, assessments: 3, reports: 5 },
    pro: { chatMessages: 1000, assessments: -1, reports: 5 },
  };
  registerProductPlans("support", {
    free: {
      name: "Free",
      slug: "free",
      description: "",
      descriptionMn: "",
      priceOneTime: 0,
      targetAudience: "",
      aiModelLabel: "",
      limits: limits.free,
      features: [],
      featuresMn: [],
    },
    standard: {
      name: "Standard",
      slug: "standard",
      description: "",
      descriptionMn: "",
      priceOneTime: 29_900,
      targetAudience: "",
      aiModelLabel: "",
      limits: limits.standard,
      features: [],
      featuresMn: [],
    },
    pro: {
      name: "Pro",
      slug: "pro",
      description: "",
      descriptionMn: "",
      priceOneTime: 99_000,
      targetAudience: "",
      aiModelLabel: "",
      limits: limits.pro,
      features: [],
      featuresMn: [],
    },
  });
  registerUpgradeMessages("support", {
    free: {
      chat: "Standard авбал 500 мессеж нээгдэнэ",
      assessment: "Standard авбал 3 удаа дэлгэрэнгүй тест хийнэ",
      report: "Standard авбал 5 бүтэн тайлан гаргана",
    },
    standard: {
      chat: "Pro авбал 1,000 мессеж нээгдэнэ",
      assessment: "Pro авбал хязгааргүй тест хийнэ",
      report: "Тайлан гаргах боломж дууслаа",
    },
    pro: {
      chat: "Чат мессеж дууслаа",
      assessment: "",
      report: "Тайлан гаргах боломж дууслаа",
    },
  });
  registerActionLabels("support", {
    chat: "мессеж",
    assessment: "тест",
    report: "тайлан",
  });
  // Support's plan limits were named before its action slugs, so the
  // remap has to be registered too — mirrors CAREER_ACTION_LIMIT_KEYS.
  // `invoice_scan` below deliberately registers nothing, which is the
  // path a product that names its limits after its actions takes.
  registerActionLimitKeys("support", {
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
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("6");
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

describe("recordFeatureUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChainMocks();
  });

  it("issues an update on the user_quotas table for chat", async () => {
    await recordFeatureUsage("u1", "chat", 0.05);

    expect(mocks.mockUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.mockUpdateSet).toHaveBeenCalledTimes(1);
    expect(mocks.mockUpdateWhere).toHaveBeenCalledTimes(1);
  });

  it("issues an update for assessment action", async () => {
    await recordFeatureUsage("u1", "assessment");

    expect(mocks.mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("issues an update for report action", async () => {
    await recordFeatureUsage("u1", "report");

    expect(mocks.mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("defaults costUsd to 0 when omitted", async () => {
    await expect(recordFeatureUsage("u1", "chat")).resolves.not.toThrow();
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
    // The point of the JSONB cutover: a vertical adds a counter by
    // naming it, not by migrating a public package's table.
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
