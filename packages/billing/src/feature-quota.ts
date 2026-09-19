/**
 * Feature-based quota enforcement.
 *
 * One row per user in `user_quotas` holds a `usage` JSONB map of
 * per-action counters, incremented atomically, so a check is O(1)
 * rather than a SUM over usage records. Limits come from the plan
 * catalogue the product registered; this module knows no action names.
 *
 * The row carries no period, so a counter is a lifetime total: nothing
 * here resets it, and a limit caps all use until the product clears
 * `usage` itself.
 */

import { db } from "@intelligo-dev/core/db";
import { userQuotas } from "@intelligo-dev/core/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getDefaultProductSlug, getPlanConfigs } from "./plans";
import { getUpgradeMessage, getActionLimitKey } from "./plan-registry";

/**
 * An opaque action slug owned by the vertical product — "chat",
 * "assessment", "invoice_scan". Nothing here enumerates them.
 */
export type QuotaAction = string;

export interface FeatureQuotaResult {
  allowed: boolean;
  action: QuotaAction;
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  /**
   * True once usage crosses 80%. The sentence that says so is the
   * consumer's, in the product's own voice.
   */
  nearingLimit: boolean;
  /** Registered by the product through `registerUpgradeMessages()`. */
  upgradeMessage?: string;
}

/**
 * Resolve the limit for a (plan, action) pair through the registry.
 *
 * The limit field is normally the action slug itself; a product whose
 * limit names differ (`chat` capped by `chatMessages`) declares the
 * remap via registerActionLimitKeys. An action with no limit configured
 * resolves to 0 — refused, not silently unlimited.
 */
function getActionLimit(
  plan: string,
  action: QuotaAction,
  productSlug: string = getDefaultProductSlug()
): number {
  const configs = getPlanConfigs(productSlug);
  const planConfig = configs[plan] ?? configs.free;
  if (!planConfig) return 0;

  const limitKey = getActionLimitKey(productSlug, action);
  const limit = (planConfig.limits as unknown as Record<string, unknown>)[
    limitKey
  ];
  return typeof limit === "number" ? limit : 0;
}

/**
 * Get or create user quota record
 */
type EnsuredQuota = {
  usage: Record<string, number>;
};

async function ensureUserQuota(
  userId: string,
  workspaceId: string,
  plan: string
): Promise<EnsuredQuota> {
  const scope = and(
    eq(userQuotas.userId, userId),
    eq(userQuotas.workspaceId, workspaceId)
  );

  const existing = await db.select().from(userQuotas).where(scope).limit(1);

  if (existing[0]) {
    if (existing[0].plan !== plan) {
      await db
        .update(userQuotas)
        .set({ plan, updatedAt: new Date() })
        .where(scope);
    }
    return { usage: (existing[0].usage as Record<string, number>) ?? {} };
  }

  await db.insert(userQuotas).values({
    id: crypto.randomUUID(),
    userId,
    workspaceId,
    plan,
  });

  return { usage: {} };
}

/**
 * Check if user can perform an action
 */
export async function checkFeatureQuota(
  userId: string,
  workspaceId: string,
  plan: string,
  action: QuotaAction
): Promise<FeatureQuotaResult> {
  const quota = await ensureUserQuota(userId, workspaceId, plan);
  const limit = getActionLimit(plan, action);

  const used = quota.usage[action] ?? 0;

  // Unlimited (-1)
  if (limit === -1) {
    return {
      allowed: true,
      action,
      used,
      limit: -1,
      remaining: -1,
      percentage: 0,
      nearingLimit: false,
    };
  }

  const remaining = Math.max(0, limit - used);
  // Stryker disable next-line ConditionalExpression,EqualityOperator: equivalent — a limit of zero or less never reaches this value: -1 returned above, and the exceeded branch below reports 100 of its own.
  const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;

  // Exceeded — pull the upgrade copy from the product registry.
  if (used >= limit) {
    return {
      allowed: false,
      action,
      used,
      limit,
      remaining: 0,
      percentage: 100,
      nearingLimit: true,
      upgradeMessage:
        getUpgradeMessage(getDefaultProductSlug(), plan, action) ?? "Upgrade",
    };
  }

  return {
    allowed: true,
    action,
    used,
    limit,
    remaining,
    percentage,
    nearingLimit: percentage >= 80,
  };
}

/**
 * Record one completed action (atomic increment).
 *
 * The whole increment happens in SQL — `usage || jsonb_build_object(...)`
 * reads and writes the counter inside a single UPDATE, so concurrent
 * requests for the same user cannot lose an increment the way a
 * read-modify-write in application code would.
 */
export async function recordFeatureUsage(
  userId: string,
  workspaceId: string,
  action: QuotaAction,
  costUsd: number = 0
): Promise<void> {
  await db
    .update(userQuotas)
    .set({
      usage: sql`COALESCE(${userQuotas.usage}, '{}'::jsonb) || jsonb_build_object(${action}, COALESCE((${userQuotas.usage}->>${action})::int, 0) + 1)`,
      totalCostUsd: sql`${userQuotas.totalCostUsd} + ${costUsd}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userQuotas.userId, userId),
        eq(userQuotas.workspaceId, workspaceId)
      )
    );
}

/** Quota stats for the given action slugs, for dashboard display. */
export async function getUserQuotaStats(
  userId: string,
  workspaceId: string,
  plan: string,
  actions: readonly QuotaAction[]
): Promise<Record<string, FeatureQuotaResult>> {
  const results = await Promise.all(
    actions.map((action) =>
      checkFeatureQuota(userId, workspaceId, plan, action)
    )
  );
  return Object.fromEntries(
    actions.map((action, i) => [action, results[i]!])
  ) as Record<string, FeatureQuotaResult>;
}
