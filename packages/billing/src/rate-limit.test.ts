/**
 * rate-limit.ts tests — pins the per-plan counting contract.
 *
 * Regression guard for B-05b: the DO NOTHING variant admitted exactly
 * one request per minute bucket on every plan. The counter upsert must
 * admit `limit` requests per bucket and reject from `limit + 1` on.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  insertReturning: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  insertValues: vi.fn(),
  insert: vi.fn(),
  deleteReturning: vi.fn(),
  deleteWhere: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@intelligo-dev/core/db", () => ({
  db: {
    insert: mocks.insert,
    delete: mocks.del,
  },
}));

vi.mock("@intelligo-dev/core/db/schema", () => ({
  rateLimitEntries: {
    id: "id",
    workspaceId: "workspaceId",
    endpoint: "endpoint",
    requestedAt: "requestedAt",
    minuteBucket: "minuteBucket",
    count: "count",
  },
}));

import {
  checkRateLimit,
  cleanupRateLimitEntries,
  DEFAULT_REQUESTS_PER_MINUTE,
} from "./rate-limit";
import {
  registerRateLimits,
  setDefaultProductSlug,
  clearRateLimits,
  clearDefaultProductSlug,
} from "./plan-registry";

function mockBucketCount(count: number) {
  mocks.insertReturning.mockResolvedValue([{ count }]);
}

beforeEach(() => {
  clearRateLimits();
  clearDefaultProductSlug();
  vi.resetAllMocks();
  mocks.insert.mockReturnValue({ values: mocks.insertValues });
  mocks.insertValues.mockReturnValue({
    onConflictDoUpdate: mocks.onConflictDoUpdate,
  });
  mocks.onConflictDoUpdate.mockReturnValue({
    returning: mocks.insertReturning,
  });
  mocks.del.mockReturnValue({ where: mocks.deleteWhere });
  mocks.deleteWhere.mockReturnValue({ returning: mocks.deleteReturning });
});

describe("checkRateLimit", () => {
  it("allows the first request with remaining = limit - 1", async () => {
    mockBucketCount(1);
    const result = await checkRateLimit("ws-1", "free");

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(9);
  });

  it("upserts with an atomic counter increment (not DO NOTHING)", async () => {
    mockBucketCount(1);
    await checkRateLimit("ws-1", "free");

    expect(mocks.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    const arg = mocks.onConflictDoUpdate.mock.calls[0]![0]! as {
      target: unknown[];
      set: Record<string, unknown>;
    };
    expect(arg.target).toEqual(["workspaceId", "endpoint", "minuteBucket"]);
    expect(arg.set.count).toBeDefined();
  });

  // The plan names and numbers are the registry's now, not this
  // package's — the ceilings below are registered per test rather
  // than read off a constant that named one product's plans.
  it.each([
    ["free", 10],
    ["standard", 60],
    ["pro", 300],
  ] as const)(
    "%s plan admits request number %i (the limit)",
    async (plan, limit) => {
      setDefaultProductSlug("test");
      registerRateLimits("test", { free: 10, standard: 60, pro: 300 });
      mockBucketCount(limit);
      const result = await checkRateLimit("ws-1", plan);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    }
  );

  it.each([
    ["free", 11],
    ["standard", 61],
    ["pro", 301],
  ] as const)(
    "%s plan rejects request number %i (limit + 1)",
    async (plan, over) => {
      setDefaultProductSlug("test");
      registerRateLimits("test", { free: 10, standard: 60, pro: 300 });
      mockBucketCount(over);
      const result = await checkRateLimit("ws-1", plan);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  );

  it("admits exactly `limit` of a burst of concurrent requests", async () => {
    // Simulate 15 concurrent requests: the DB hands each a unique
    // sequential count regardless of arrival order.
    let seq = 0;
    mocks.insertReturning.mockImplementation(async () => [{ count: ++seq }]);

    const results = await Promise.all(
      Array.from({ length: 15 }, () => checkRateLimit("ws-1", "free"))
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(
      DEFAULT_REQUESTS_PER_MINUTE
    );
  });

  it("defaults an unknown plan to the conservative ceiling", async () => {
    mockBucketCount(11);
    const result = await checkRateLimit("ws-1", "not-a-plan");

    expect(result.limit).toBe(DEFAULT_REQUESTS_PER_MINUTE);
    expect(result.allowed).toBe(false);
  });

  it("resets at the next minute boundary", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-25T10:15:42.500Z"));
      mockBucketCount(1);

      const result = await checkRateLimit("ws-1", "free");

      expect(result.resetAt.toISOString()).toBe("2026-08-25T10:16:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the floored minute bucket in the upsert values", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-25T10:15:42.500Z"));
      mockBucketCount(1);

      await checkRateLimit("ws-1", "free");

      const values = mocks.insertValues.mock.calls[0]![0]! as {
        minuteBucket: Date;
      };
      expect(values.minuteBucket.toISOString()).toBe(
        "2026-08-25T10:15:00.000Z"
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("cleanupRateLimitEntries", () => {
  it("returns the number of deleted rows", async () => {
    mocks.deleteReturning.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    await expect(cleanupRateLimitEntries()).resolves.toBe(2);
  });

  it("returns 0 when nothing is stale", async () => {
    mocks.deleteReturning.mockResolvedValue([]);
    await expect(cleanupRateLimitEntries()).resolves.toBe(0);
  });
});

/**
 * Per-plan ceilings come from the registry now.
 *
 * They were a constant in this package naming one product's plans plus an
 * `enterprise` tier that is not in `PlanSlug`, so the 300/min row was
 * unreachable and `standard` quietly got the free ceiling.
 */
describe("registered per-plan ceilings", () => {
  beforeEach(() => {
    clearRateLimits();
    clearDefaultProductSlug();
  });

  it("uses the conservative default when nothing is registered", async () => {
    // Not a throw: an unconfigured deployment must still be able to
    // rate-limit a request, just not generously.
    mockBucketCount(DEFAULT_REQUESTS_PER_MINUTE + 1);
    const result = await checkRateLimit("ws-1", "pro");

    expect(result.limit).toBe(DEFAULT_REQUESTS_PER_MINUTE);
    expect(result.allowed).toBe(false);
  });

  it("honours what the product registered", async () => {
    setDefaultProductSlug("acme");
    registerRateLimits("acme", { free: 10, standard: 60, pro: 300 });

    mockBucketCount(60);
    expect((await checkRateLimit("ws-1", "pro")).allowed).toBe(true);
    expect((await checkRateLimit("ws-1", "pro")).limit).toBe(300);
  });

  it("gives an unregistered plan the default, not another plan's", async () => {
    setDefaultProductSlug("acme");
    registerRateLimits("acme", { free: 10, pro: 300 });

    mockBucketCount(11);
    const result = await checkRateLimit("ws-1", "standard");

    expect(result.limit).toBe(DEFAULT_REQUESTS_PER_MINUTE);
    expect(result.allowed).toBe(false);
  });
});
