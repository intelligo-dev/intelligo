/**
 * features.ts tests — focused on the in-process hasFeature cache and
 * its invalidation hooks. The cache is the difference between one DB
 * round-trip per chat turn and one per minute, so the contract that
 * webhook handlers use to drop entries needs an explicit guard.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceSubscription: vi.fn(),
  hasActiveTrial: vi.fn(),
  selectLimit: vi.fn(),
  selectWhere: vi.fn(),
  selectFrom: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@intelligo-dev/core/db", () => ({
  db: {
    select: mocks.select,
  },
}));

vi.mock("@intelligo-dev/core/db/schema", () => ({
  featureFlags: { name: "name" },
}));

vi.mock("./queries", () => ({
  getWorkspaceSubscription: mocks.getWorkspaceSubscription,
}));

vi.mock("./trial", () => ({
  hasActiveTrial: mocks.hasActiveTrial,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
}));

import { hasFeature, invalidateFeatureCache } from "./features";
import {
  registerProductFeatures,
  setDefaultProductSlug,
} from "./plan-registry";

// The feature matrix is product-owned and registered by the
// composition root (ADR-0006) — there is no built-in support matrix to
// fall through to any more, so the test registers what it asserts on.
setDefaultProductSlug("support");
registerProductFeatures("support", {
  career_advisor: ["free", "standard", "pro"],
  detailed_assessment: ["standard", "pro"],
  vision: ["standard", "pro"],
  web_search: ["pro"],
});

beforeEach(() => {
  vi.resetAllMocks();

  mocks.selectWhere.mockReturnValue({ limit: mocks.selectLimit });
  mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
  mocks.select.mockReturnValue({ from: mocks.selectFrom });

  // No DB feature_flag override — fall through to the registered matrix.
  mocks.selectLimit.mockResolvedValue([]);

  mocks.hasActiveTrial.mockResolvedValue(false);

  // Default: workspace is on the free plan.
  mocks.getWorkspaceSubscription.mockResolvedValue({
    plan: { slug: "free" },
  });

  // Drop any cache entries left over from a previous test in this file.
  invalidateFeatureCache();
});

describe("hasFeature in-process cache", () => {
  it("hits the DB once for repeated calls within the TTL window", async () => {
    const a = await hasFeature("ws-1", "career_advisor");
    const b = await hasFeature("ws-1", "career_advisor");
    const c = await hasFeature("ws-1", "career_advisor");

    expect([a, b, c]).toEqual([true, true, true]);
    // free plan has career_advisor — but more importantly, only one
    // subscription lookup happened across all three calls.
    expect(mocks.getWorkspaceSubscription).toHaveBeenCalledTimes(1);
  });

  it("keys the cache by (workspaceId, feature) — different features miss separately", async () => {
    await hasFeature("ws-1", "career_advisor");
    await hasFeature("ws-1", "detailed_assessment");

    expect(mocks.getWorkspaceSubscription).toHaveBeenCalledTimes(2);
  });

  it("workspace-scoped invalidate drops only that workspace's entries", async () => {
    await hasFeature("ws-1", "career_advisor");
    await hasFeature("ws-2", "career_advisor");
    expect(mocks.getWorkspaceSubscription).toHaveBeenCalledTimes(2);

    invalidateFeatureCache("ws-1");

    await hasFeature("ws-1", "career_advisor"); // misses → DB read
    await hasFeature("ws-2", "career_advisor"); // hits → no DB read

    expect(mocks.getWorkspaceSubscription).toHaveBeenCalledTimes(3);
  });

  it("global invalidate (no arg) drops every entry", async () => {
    await hasFeature("ws-1", "career_advisor");
    await hasFeature("ws-2", "career_advisor");
    expect(mocks.getWorkspaceSubscription).toHaveBeenCalledTimes(2);

    invalidateFeatureCache();

    await hasFeature("ws-1", "career_advisor");
    await hasFeature("ws-2", "career_advisor");

    expect(mocks.getWorkspaceSubscription).toHaveBeenCalledTimes(4);
  });

  it("invalidate with a workspace that has no entries is a safe no-op", async () => {
    await hasFeature("ws-1", "career_advisor");
    expect(mocks.getWorkspaceSubscription).toHaveBeenCalledTimes(1);

    invalidateFeatureCache("ws-unknown");

    await hasFeature("ws-1", "career_advisor"); // still cached
    expect(mocks.getWorkspaceSubscription).toHaveBeenCalledTimes(1);
  });

  it("post-upgrade webhook flow: tier flip is visible immediately after invalidation", async () => {
    // First read: workspace is free, asks for a paid-only feature.
    mocks.getWorkspaceSubscription.mockResolvedValue({
      plan: { slug: "free" },
    });
    const before = await hasFeature("ws-1", "detailed_assessment");
    expect(before).toBe(false);

    // Stripe checkout completes; webhook flips the workspace to standard
    // and calls invalidateFeatureCache(workspaceId).
    mocks.getWorkspaceSubscription.mockResolvedValue({
      plan: { slug: "standard" },
    });
    invalidateFeatureCache("ws-1");

    const after = await hasFeature("ws-1", "detailed_assessment");
    expect(after).toBe(true);
    // Two cache misses total — pre-upgrade and post-invalidate.
    expect(mocks.getWorkspaceSubscription).toHaveBeenCalledTimes(2);
  });
});
