import { db } from "@intelligo-dev/core/db";
import { monthlyUsage } from "@intelligo-dev/core/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Get the current billing period start and end dates.
 */
export function getCurrentPeriodStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function getCurrentPeriodEnd(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Get the current monthly_usage row for a workspace in the current period.
 * Returns { tokensUsed, allowanceUsedMicros, requestCount } or zero
 * defaults if no row exists.
 *
 * Reads without FOR UPDATE: concurrent requests are handled by SQL-level
 * atomic arithmetic in recordTokenUsage, not a JS read-modify-write.
 */
export async function getCurrentMonthlyUsage(workspaceId: string) {
  const periodStart = getCurrentPeriodStart();

  const rows = await db
    .select({
      tokensUsed: monthlyUsage.tokensUsed,
      allowanceUsedMicros: monthlyUsage.allowanceUsedMicros,
      currency: monthlyUsage.currency,
      requestCount: monthlyUsage.requestCount,
    })
    .from(monthlyUsage)
    .where(
      and(
        eq(monthlyUsage.workspaceId, workspaceId),
        eq(monthlyUsage.periodStart, periodStart)
      )
    )
    .limit(1)
    .execute();

  if (rows.length === 0 || !rows[0]) {
    return {
      tokensUsed: 0,
      allowanceUsedMicros: 0,
      /** Null until a period row exists to denominate. */
      currency: null as string | null,
      requestCount: 0,
    };
  }

  return rows[0];
}
