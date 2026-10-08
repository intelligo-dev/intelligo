/**
 * Feature checking: resolves a workspace's plan from its subscription
 * (or active trial) and checks the `feature_flags` table for runtime
 * overrides before falling back to the registered feature matrix.
 * Every DB read degrades gracefully to the registered defaults.
 */

import { db } from "@intelligo-dev/core/db";
import { featureFlags } from "@intelligo-dev/core/db/schema";
import { eq } from "drizzle-orm";
import { getWorkspaceSubscription, subscriptionEntitles } from "./queries";
import { hasActiveTrial } from "./trial";
import {
  getDefaultProductSlug,
  getProductFeatures,
  getTeamMemberLimit,
  getTrialPlanSlug,
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
 * The workspace's plan slug: its subscription's plan while the
 * subscription's status entitles it (see `subscriptionEntitles`), the
 * registered trial plan during an active trial, "free" otherwise (and
 * on error).
 */
export async function getWorkspacePlan(workspaceId: string): Promise<string> {
  return (await resolveWorkspacePlan(workspaceId)).plan;
}

/**
 * A plan or feature answer, and whether a failed read decided it. A
 * degraded answer is returned but never cached.
 */
type Resolved<T> = { value: T; degraded: boolean };

async function resolveWorkspacePlan(
  workspaceId: string
): Promise<{ plan: string; degraded: boolean }> {
  try {
    const subscriptionData = await getWorkspaceSubscription(workspaceId);
    const paidSlug =
      subscriptionData?.plan?.slug &&
      subscriptionEntitles(subscriptionData.subscription.status)
        ? subscriptionData.plan.slug
        : null;
    if (paidSlug && paidSlug !== "free") {
      return { plan: paidSlug, degraded: false };
    }

    // Every workspace carries a free subscription row, so the trial is
    // checked for a free plan as well as for no row at all.
    if (await hasActiveTrial(workspaceId)) {
      return { plan: getTrialPlanSlug(), degraded: false };
    }

    return { plan: "free", degraded: false };
  } catch (error) {
    console.error(
      "[getWorkspacePlan] Failed to query subscription data:",
      error
    );
    return { plan: "free", degraded: true };
  }
}

/**
 * In-process feature-lookup cache. Every chat turn calls hasFeature at
 * least once; without a cache that is a subscription + feature_flags
 * round-trip per message. A 60-second TTL is safe because the inputs
 * only change on a billing webhook or admin toggle, both of which call
 * invalidateFeatureCache. An answer computed while a read failed is not
 * cached, so the next call asks again. An expired entry is dropped when
 * it is read, expired entries are swept once the cache reaches
 * `FEATURE_CACHE_MAX_ENTRIES`, and past that the oldest entries go.
 */
const FEATURE_CACHE_TTL_MS = 60 * 1000;
const FEATURE_CACHE_MAX_ENTRIES = 10_000;
const featureCache = new Map<string, { value: boolean; expiresAt: number }>();

function cacheFeature(key: string, value: boolean, now: number): void {
  if (featureCache.size >= FEATURE_CACHE_MAX_ENTRIES) {
    for (const [cachedKey, entry] of featureCache) {
      if (entry.expiresAt <= now) featureCache.delete(cachedKey);
    }
    for (const oldest of featureCache.keys()) {
      if (featureCache.size < FEATURE_CACHE_MAX_ENTRIES) break;
      featureCache.delete(oldest);
    }
  }
  featureCache.set(key, { value, expiresAt: now + FEATURE_CACHE_TTL_MS });
}

/** How many answers the cache holds, expired ones included. */
export function featureCacheSize(): number {
  return featureCache.size;
}

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
 * seconds (see invalidateFeatureCache); one decided after a failed read
 * is not.
 */
export async function hasFeature(
  workspaceId: string,
  feature: string
): Promise<boolean> {
  const now = Date.now();
  const key = featureCacheKey(workspaceId, feature);
  const cached = featureCache.get(key);
  if (cached) {
    if (cached.expiresAt > now) return cached.value;
    featureCache.delete(key);
  }

  const { value, degraded } = await computeHasFeature(workspaceId, feature);
  if (!degraded) cacheFeature(key, value, now);
  return value;
}

async function computeHasFeature(
  workspaceId: string,
  feature: string
): Promise<Resolved<boolean>> {
  const { plan, degraded } = await resolveWorkspacePlan(workspaceId);
  const answer = (value: boolean): Resolved<boolean> => ({ value, degraded });

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
        return answer(false);
      }

      try {
        const enabledPlans = JSON.parse(dbFlag.enabledPlans) as string[];
        return answer(enabledPlans.includes(plan));
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
    return answer(allowed ? allowed.includes(plan) : false);
  } catch (error) {
    console.error(
      `[hasFeature] DB query failed for feature "${feature}", falling back to the registered matrix:`,
      error
    );
    // Graceful degradation: use the registered matrix on DB error, and
    // do not cache it — a kill switch the read missed must apply as
    // soon as the database answers again.
    const allowed = featureMatrix()[feature];
    return {
      value: allowed ? allowed.includes(plan) : false,
      degraded: true,
    };
  }
}

/**
 * Thrown by `requireFeature`. `requiredPlans` is the registered matrix's
 * answer to "which plans grant this" — empty when the feature is not
 * registered, and not authoritative when a `feature_flags` row
 * overrides the matrix.
 */
export class FeatureNotAvailableError extends Error {
  readonly code = "feature_not_available";
  readonly feature: string;
  readonly currentPlan: string;
  readonly requiredPlans: readonly string[];

  constructor(
    feature: string,
    currentPlan: string,
    requiredPlans: readonly string[]
  ) {
    super(
      `Feature "${feature}" requires a plan upgrade. Current plan does not include this feature.`
    );
    this.name = "FeatureNotAvailableError";
    this.feature = feature;
    this.currentPlan = currentPlan;
    this.requiredPlans = requiredPlans;
  }
}

export function isFeatureNotAvailableError(
  error: unknown
): error is FeatureNotAvailableError {
  return error instanceof FeatureNotAvailableError;
}

/**
 * Require feature access or throw, for server actions that gate on a
 * feature.
 *
 * @throws {FeatureNotAvailableError} if the feature is not available on
 * the workspace's plan
 */
export async function requireFeature(
  workspaceId: string,
  feature: string
): Promise<void> {
  const allowed = await hasFeature(workspaceId, feature);
  if (!allowed) {
    throw new FeatureNotAvailableError(
      feature,
      await getWorkspacePlan(workspaceId),
      featureMatrix()[feature] ?? []
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
