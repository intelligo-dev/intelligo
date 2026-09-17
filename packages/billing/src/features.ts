/**
 * Feature Checking Engine
 *
 * v0.4: Real subscription lookup + DB-backed feature flag runtime toggleability.
 * getWorkspacePlan() queries subscriptions table and respects trial status.
 * hasFeature() checks feature_flags table for runtime overrides before falling back to the registered feature matrix.
 *
 * IMPORTANT: DB query with graceful degradation - falls back to constants on error.
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
 * bills against.
 *
 * The matrix itself is product vocabulary and lives in the vertical
 *; the composition root registers it. Until Phase 3 the
 * first product's complete list — four feature keys in its own
 * vocabulary — was a hardcoded constant in this file, inside a package
 * headed for publication. The
 * plan catalogue had already been moved out for the same reason; this
 * is the sibling leak that survived it.
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
 * Get workspace plan
 *
 * v0.4: Returns actual subscription plan slug from database.
 * Queries subscriptions table for real plan data.
 * Grants "pro" to workspaces with active trial.
 * Falls back to "free" if no subscription and no trial.
 */
export async function getWorkspacePlan(workspaceId: string): Promise<string> {
  try {
    // Check for real subscription first
    const subscriptionData = await getWorkspaceSubscription(workspaceId);
    if (subscriptionData?.plan?.slug) {
      return subscriptionData.plan.slug;
    }

    // Check for active trial (grants Pro access)
    const hasTrial = await hasActiveTrial(workspaceId);
    if (hasTrial) {
      return "pro";
    }

    // Default fallback: free plan
    return "free";
  } catch (error) {
    console.error(
      "[getWorkspacePlan] Failed to query subscription data:",
      error
    );
    // Safe default on error
    return "free";
  }
}

/**
 * In-process feature-lookup cache. Every /api/chat turn calls hasFeature
 * at least once (see conversation-loader.ts tier resolution); without a
 * cache that's a subscription + feature_flags round-trip per message. A
 * 60-second TTL is safe because the inputs (plan, kill switch, enabled
 * plan list) only change on a billing webhook or admin toggle — both of
 * which call invalidateFeatureCache to bust stale entries.
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
 * Check if workspace has access to a feature
 *
 * FLAG-01: Server-side feature checking
 * FLAG-03: Queries feature_flags table for runtime overrides before falling back to the registered matrix
 *
 * v0.4: DB-backed with graceful degradation.
 * If DB query fails, falls back to the registered feature matrix.
 * If DB record exists:
 *   - isActive=false blocks the feature globally (kill switch)
 *   - enabledPlans JSON array determines access
 * If no DB record exists, uses the registered feature matrix
 *
 * Results are cached in-process for 60 seconds (see invalidateFeatureCache).
 *
 * @param workspaceId - Workspace ID to check
 * @param feature - Feature name (as registered by the product)
 * @returns true if workspace's plan includes the feature
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
    // FIRST: Check feature_flags table for runtime override
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

      // Parse enabledPlans JSON array
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
    // Graceful degradation: use constant on DB error
    const allowed = featureMatrix()[feature];
    if (!allowed) return false;
    return allowed.includes(plan);
  }
}

/**
 * Require feature access or throw
 *
 * Convenience wrapper for server actions that need to gate on features.
 *
 * @param workspaceId - Workspace ID to check
 * @param feature - Feature name (as registered by the product)
 * @throws Error if feature is not available for workspace's plan
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
 * Check team member limit for workspace plan
 *
 * FLAG-05: Team member limits per plan
 *
 * @param workspaceId - Workspace ID to check
 * @param currentMemberCount - Current number of members
 * @returns Object with allowed flag, limit, and current count
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
