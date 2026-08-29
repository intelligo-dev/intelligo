/**
 * Usage tracking helpers for quota enforcement.
 */

import { db } from "@intelligo/core/db";
import { monthlyUsage } from "@intelligo/core/db/schema";
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
 * Returns { tokensUsed, chargedMnt, requestCount } or zero defaults if no row exists.
 *
 * Note: FOR UPDATE lock removed. The grace period (which required lock protection)
 * was removed — worst-case per-request cost (~138K MNT) exceeds any realistic grace
 * buffer when plan allowance is only 2K MNT. Concurrent requests are handled by
 * SQL-level atomic arithmetic in recordTokenUsage (sql`` template, not JS read-modify-write).
 */
export async function getCurrentMonthlyUsage(workspaceId: string) {
  const periodStart = getCurrentPeriodStart();

  const rows = await db
    .select({
      tokensUsed: monthlyUsage.tokensUsed,
      chargedMnt: monthlyUsage.chargedMnt,
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
    return { tokensUsed: 0, chargedMnt: 0, requestCount: 0 };
  }

  return rows[0];
}
