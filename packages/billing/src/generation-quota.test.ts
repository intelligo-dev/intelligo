/**
 * Generation Quota Tests
 *
 * Tests for checkGenerationQuota, recordGeneration, and getGenerationUsage.
 * All DB and query calls are mocked so no real database or API keys are needed.
 *
 * NOTE: Image generation is not used in Support Assistant.
 * getPlanGenerationLimit() returns 0 for all plans, so all quota checks deny.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock state (declared before vi.mock calls get hoisted)
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const mockWhere = vi.fn();
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  const mockInsertValues = vi.fn().mockResolvedValue([]);
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
  const mockGetWorkspaceBilling = vi.fn();

  return {
    mockWhere,
    mockFrom,
    mockSelect,
    mockInsertValues,
    mockInsert,
    mockGetWorkspaceBilling,
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@intelligo-dev/core/db", () => ({
  db: {
    select: mocks.mockSelect,
    insert: mocks.mockInsert,
  },
}));

vi.mock("@intelligo-dev/core/db/schema", () => ({
  imageGenerations: {
    workspaceId: "workspaceId",
    createdAt: "createdAt",
    status: "status",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
  gte: vi.fn((col: unknown, val: unknown) => ({ op: "gte", col, val })),
  ne: vi.fn((col: unknown, val: unknown) => ({ op: "ne", col, val })),
  sql: vi.fn((strings: TemplateStringsArray) => ({ raw: strings[0] })),
}));

vi.mock("./queries", () => ({
  getWorkspaceBilling: (...args: unknown[]) =>
    mocks.mockGetWorkspaceBilling(...args),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  checkGenerationQuota,
  recordGeneration,
  getGenerationUsage,
  type RecordGenerationParams,
} from "./generation-quota";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockDailyCount(count: number) {
  mocks.mockWhere.mockResolvedValue([{ count }]);
}

function mockPlan(slug: "free" | "pro" | "enterprise" | string) {
  mocks.mockGetWorkspaceBilling.mockResolvedValue({ plan: { slug } });
}

function resetChainMocks() {
  mocks.mockFrom.mockReturnValue({ where: mocks.mockWhere });
  mocks.mockSelect.mockReturnValue({ from: mocks.mockFrom });
  mocks.mockInsert.mockReturnValue({ values: mocks.mockInsertValues });
}

// ---------------------------------------------------------------------------
// checkGenerationQuota — all plans return limit=0 (image gen disabled)
// ---------------------------------------------------------------------------

describe("checkGenerationQuota — image generation disabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChainMocks();
  });

  it("free plan: limit is 0, denies with 0 daily uses", async () => {
    mockPlan("free");
    mockDailyCount(0);

    const result = await checkGenerationQuota("ws-test");

    expect(result.allowed).toBe(false);
    expect(result.usage.limit).toBe(0);
  });

  it("pro plan: limit is 0, denies with 0 daily uses", async () => {
    mockPlan("pro");
    mockDailyCount(0);

    const result = await checkGenerationQuota("ws-test");

    expect(result.allowed).toBe(false);
    expect(result.usage.limit).toBe(0);
  });

  it("enterprise plan: limit is 0, denies with 0 daily uses", async () => {
    mockPlan("enterprise");
    mockDailyCount(0);

    const result = await checkGenerationQuota("ws-test");

    expect(result.allowed).toBe(false);
    expect(result.usage.limit).toBe(0);
  });

  it("unknown plan: limit is 0", async () => {
    mockPlan("unknown-plan");
    mockDailyCount(0);

    const result = await checkGenerationQuota("ws-test");

    expect(result.usage.limit).toBe(0);
    expect(result.allowed).toBe(false);
  });

  it("null plan: limit is 0", async () => {
    mocks.mockGetWorkspaceBilling.mockResolvedValue({ plan: null });
    mockDailyCount(0);

    const result = await checkGenerationQuota("ws-test");

    expect(result.usage.limit).toBe(0);
    expect(result.allowed).toBe(false);
  });

  it("remaining is always 0", async () => {
    mockPlan("pro");
    mockDailyCount(0);

    const result = await checkGenerationQuota("ws-test");

    expect(result.usage.remaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// recordGeneration
// ---------------------------------------------------------------------------

describe("recordGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChainMocks();
  });

  const baseParams: RecordGenerationParams = {
    workspaceId: "ws-123",
    userId: "user-456",
    toolId: "tool-789",
    prompt: "A red sunset over mountains",
    resultUrl: "https://example.com/img.png",
    model: "gpt-image-1",
    status: "completed",
  };

  it("calls db.insert with correct workspaceId, userId, and toolId", async () => {
    await recordGeneration(baseParams);

    expect(mocks.mockInsert).toHaveBeenCalledTimes(1);
    expect(mocks.mockInsertValues).toHaveBeenCalledTimes(1);

    const insertedValues = mocks.mockInsertValues.mock.calls[0]![0];
    expect(insertedValues.workspaceId).toBe("ws-123");
    expect(insertedValues.userId).toBe("user-456");
    expect(insertedValues.toolId).toBe("tool-789");
  });

  it("calls db.insert with the prompt and model", async () => {
    await recordGeneration(baseParams);

    const insertedValues = mocks.mockInsertValues.mock.calls[0]![0];
    expect(insertedValues.prompt).toBe("A red sunset over mountains");
    expect(insertedValues.model).toBe("gpt-image-1");
  });

  it("calls db.insert with status=completed for successful generation", async () => {
    await recordGeneration(baseParams);

    const insertedValues = mocks.mockInsertValues.mock.calls[0]![0];
    expect(insertedValues.status).toBe("completed");
  });

  it("calls db.insert with status=failed and errorMessage for failed generation", async () => {
    await recordGeneration({
      ...baseParams,
      status: "failed",
      resultUrl: null,
      errorMessage: "OpenAI error",
    });

    const insertedValues = mocks.mockInsertValues.mock.calls[0]![0];
    expect(insertedValues.status).toBe("failed");
    expect(insertedValues.errorMessage).toBe("OpenAI error");
  });

  it("returns a string UUID", async () => {
    const id = await recordGeneration(baseParams);

    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// getGenerationUsage — all plans return limit=0
// ---------------------------------------------------------------------------

describe("getGenerationUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChainMocks();
  });

  it("returns used, limit, remaining fields", async () => {
    mockPlan("pro");
    mockDailyCount(0);

    const usage = await getGenerationUsage("ws-test");

    expect(usage).toHaveProperty("used");
    expect(usage).toHaveProperty("limit");
    expect(usage).toHaveProperty("remaining");
  });

  it("returns limit=0 and remaining=0 for all plans", async () => {
    mockPlan("pro");
    mockDailyCount(4);

    const usage = await getGenerationUsage("ws-test");

    expect(usage.used).toBe(4);
    expect(usage.limit).toBe(0);
    expect(usage.remaining).toBe(0);
  });

  it("remaining is 0 even with no uses", async () => {
    mockPlan("enterprise");
    mockDailyCount(0);

    const usage = await getGenerationUsage("ws-test");

    expect(usage.limit).toBe(0);
    expect(usage.remaining).toBe(0);
  });
});
