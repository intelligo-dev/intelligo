/**
 * Feature checking: resolves a workspace's plan from its subscription
 * (or active trial) and checks the `feature_flags` table for runtime
 * overrides before falling back to the registered feature matrix.
 * Every DB read degrades gracefully to the registered defaults.
 */

import { db } from "@intelligo-dev/core/db";
import { featureFlags } from "@intelligo-dev/core/db/schema";
import { eq } from "drizzle-orm";
import { getWorkspaceSubscription } from "./queries";
import { hasActiveTrial } from "./trial";
import {
  getDefaultProductSlug,
  getProductFeatures,
  getTeamMemberLimit,
  type ProductFeatureMatrix,
} from "./plan-registry";

/**
 * Which plans grant which feature, for the product this deployment
 * bills against. The matrix is product vocabulary; the composition root
 * registers it.
 *
 * Returns {} when nothing is registered, which denies every feature —
 * the safe direction for an access-control default.
 */
function featureMatrix(productSlug?: string): ProductFeatureMatrix {
  const slug = productSlug ?? getDefaultProductSlug();
  return getProductFeatures(slug) ?? {};
}

/** Feature name, as registered by the product. */
export type FeatureKey = string;

/**
 * The workspace's plan slug: its subscription's plan, "pro" during an
 * active trial, "free" otherwise (and on error).
 */
export async function getWorkspacePlan(workspaceId: string): Promise<string> {
  try {
    const subscriptionData = await getWorkspaceSubscription(workspaceId);
    if (subscriptionData?.plan?.slug) {
      return subscriptionData.plan.slug;
    }

    // An active trial grants Pro access.
    const hasTrial = await hasActiveTrial(workspaceId);
    if (hasTrial) {
      return "pro";
    }

    return "free";
  } catch (error) {
    console.error(
      "[getWorkspacePlan] Failed to query subscription data:",
      error
    );
    return "free";
  }
}

/**
 * In-process feature-lookup cache. Every chat turn calls hasFeature at
 * least once; without a cache that is a subscription + feature_flags
 * round-trip per message. A 60-second TTL is safe because the inputs
 * only change on a billing webhook or admin toggle, both of which call
 * invalidateFeatureCache.
 */
const FEATURE_CACHE_TTL_MS = 60 * 1000;
const featureCache = new Map<string, { value: boolean; expiresAt: number }>();

function featureCacheKey(workspaceId: string, feature: string): string {
  return `${workspaceId}:${feature}`;
}

/**
 * Drop cached hasFeature results. With no argument, clears everything
 * (use from admin "toggle kill switch" handlers). With a workspaceId,
 * only that workspace's entries are dropped (use from subscription
 * change / trial conversion webhook).
 */
export function invalidateFeatureCache(workspaceId?: string): void {
  if (!workspaceId) {
    featureCache.clear();
    return;
  }
  const prefix = `${workspaceId}:`;
  for (const key of featureCache.keys()) {
    if (key.startsWith(prefix)) featureCache.delete(key);
  }
}

/**
 * Whether the workspace's plan grants a feature.
 *
 * A `feature_flags` row overrides the registered matrix: `isActive=false`
 * blocks the feature globally (kill switch), otherwise its
 * `enabledPlans` JSON array decides. With no row, or on a DB error, the
 * registered matrix decides. Results are cached in-process for 60
 * seconds (see invalidateFeatureCache).
 */
export async function hasFeature(
  workspaceId: string,
  feature: string
): Promise<boolean> {
  const now = Date.now();
  const key = featureCacheKey(workspaceId, feature);
  const cached = featureCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = await computeHasFeature(workspaceId, feature);
  featureCache.set(key, { value, expiresAt: now + FEATURE_CACHE_TTL_MS });
  return value;
}

async function computeHasFeature(
  workspaceId: string,
  feature: string
): Promise<boolean> {
  const plan = await getWorkspacePlan(workspaceId);

  try {
    const dbFlagResult = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.name, feature))
      .limit(1);

    if (dbFlagResult.length > 0 && dbFlagResult[0]) {
      const dbFlag = dbFlagResult[0];

      // Kill switch: if isActive=false, block globally
      if (!dbFlag.isActive) {
        return false;
      }

      try {
        const enabledPlans = JSON.parse(dbFlag.enabledPlans) as string[];
        return enabledPlans.includes(plan);
      } catch (parseError) {
        console.error(
          `[hasFeature] Failed to parse enabledPlans for feature "${feature}":`,
          parseError
        );
        // Fall through to the registered matrix on parse error
      }
    }

    // No DB record or parse error: fall back to the registered matrix
    const allowed = featureMatrix()[feature];
    if (!allowed) return false;
    return allowed.includes(plan);
  } catch (error) {
    console.error(
      `[hasFeature] DB query failed for feature "${feature}", falling back to the registered matrix:`,
      error
    );
    // Graceful degradation: use the registered matrix on DB error
    const allowed = featureMatrix()[feature];
    if (!allowed) return false;
    return allowed.includes(plan);
  }
}

/**
 * Require feature access or throw, for server actions that gate on a
 * feature.
 *
 * @throws Error if the feature is not available on the workspace's plan
 */
export async function requireFeature(
  workspaceId: string,
  feature: string
): Promise<void> {
  const allowed = await hasFeature(workspaceId, feature);
  if (!allowed) {
    throw new Error(
      `Feature "${feature}" requires a plan upgrade. Current plan does not include this feature.`
    );
  }
}

/**
 * Check the workspace plan's team member limit against the current
 * member count.
 */
export async function checkTeamMemberLimit(
  workspaceId: string,
  currentMemberCount: number
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const plan = await getWorkspacePlan(workspaceId);
  const limit = getTeamMemberLimit(undefined, plan);

  if (limit === -1) {
    // Unlimited
    return { allowed: true, limit: -1, current: currentMemberCount };
  }

  return {
    allowed: currentMemberCount < limit,
    limit,
    current: currentMemberCount,
  };
}
