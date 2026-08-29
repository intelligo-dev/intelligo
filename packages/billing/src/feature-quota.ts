/**
 * Feature-based quota enforcement.
 *
 * Counts one row per user in `user_quotas` and increments a per-action
 * counter atomically, so a check is O(1) rather than a SUM over usage
 * records. Limits come from the plan catalogue the product registered;
 * this module knows no action names of its own.
 *
 * Until migration 0038 the table also carried three support-specific
 * integer columns which this module read in preference to the generic
 * map, and a hardcoded slug→column table to reach them. Both are gone:
 * counters live only in the `usage` JSONB map, keyed by whatever action
 * slugs the vertical uses.
 */

import { db } from "@intelligo/core/db";
import { userQuotas } from "@intelligo/core/db/schema";
import { eq, sql } from "drizzle-orm";
import { getDefaultProductSlug, getPlanConfigs } from "./plans";
import {
  getUpgradeMessage,
  getActionLabel,
  getActionLimitKey,
} from "./plan-registry";

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
  warning?: string; // "6 мессеж үлдлээ"
  upgradeMessage?: string; // "Standard авбал 500 мессеж нээгдэнэ"
}

/**
 * Resolve the limit for a (plan, action) pair through the registry.
 *
 * The limit field is normally the action slug itself; a product whose
 * plan limits were named before its actions were (Support caps `chat`
 * with `chatMessages`) declares the remap via registerActionLimitKeys.
 * An action with no limit configured resolves to 0 — refused, not
 * silently unlimited.
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
  const existing = await db
    .select()
    .from(userQuotas)
    .where(eq(userQuotas.userId, userId))
    .limit(1);

  if (existing[0]) {
    if (existing[0].plan !== plan) {
      await db
        .update(userQuotas)
        .set({ plan, updatedAt: new Date() })
        .where(eq(userQuotas.userId, userId));
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
    };
  }

  const remaining = Math.max(0, limit - used);
  const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;

  // Exceeded — pull the upgrade copy from the product registry. Support
  // bootstrap supplies the Mongolian strings; future verticals supply
  // their own through registerUpgradeMessages().
  if (used >= limit) {
    return {
      allowed: false,
      action,
      used,
      limit,
      remaining: 0,
      percentage: 100,
      upgradeMessage:
        getUpgradeMessage(getDefaultProductSlug(), plan, action) ?? "Upgrade",
    };
  }

  // Warning at 80% — same registry lookup for the action label.
  let warning: string | undefined;
  if (percentage >= 80) {
    const label = getActionLabel(getDefaultProductSlug(), action) ?? action;
    warning = `${remaining} ${label} үлдлээ`;
  }

  return {
    allowed: true,
    action,
    used,
    limit,
    remaining,
    percentage,
    warning,
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
    .where(eq(userQuotas.userId, userId));
}

/**
 * Quota stats for a set of actions, for dashboard display.
 *
 * Takes the action slugs from the caller. It used to return a fixed
 * `{ chat, assessment, report }` shape, which meant a public package's
 * return type enumerated one vertical's features and no other product
 * could use the function at all.
 */
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
