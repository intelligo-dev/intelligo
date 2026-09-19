import { db } from "@intelligo-dev/core/db";
import { monthlyUsage } from "@intelligo-dev/core/db/schema";
import { eq, and } from "drizzle-orm";
import type { BillingReader } from "./reader";

/**
 * The billing period is the calendar month in UTC, so every host agrees
 * on the `monthly_usage` row a request belongs to whatever zone it runs
 * in: the first instant of the month, and its last millisecond.
 */
export function getCurrentPeriodStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function getCurrentPeriodEnd(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
}

/** The period as `YYYY-MM`, the key a once-per-period record is filed under. */
export function getCurrentPeriodKey(now: Date = new Date()): string {
  return getCurrentPeriodStart(now).toISOString().slice(0, 7);
}

/**
 * Get the current monthly_usage row for a workspace in the current period.
 * Returns { tokensUsed, allowanceUsedMicros, requestCount } or zero
 * defaults if no row exists.
 *
 * Reads without FOR UPDATE: concurrent requests are handled by SQL-level
 * atomic arithmetic in recordTokenUsage, not a JS read-modify-write.
 */
export async function getCurrentMonthlyUsage(
  workspaceId: string,
  reader: BillingReader = db
) {
  const periodStart = getCurrentPeriodStart();

  const rows = await reader
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
