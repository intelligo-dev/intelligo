/**
 * Trial Credit Deduction
 *
 * Atomic deduction functions for trial credits (token-based and MNT-based).
 */

import { db } from "@intelligo-dev/core/db";
import { trialCredits } from "@intelligo-dev/core/db/schema";
import { eq, and, gt, sql } from "drizzle-orm";

/**
 * Atomically deduct tokens from trial credits.
 *
 * Uses UPDATE ... RETURNING in a single round-trip — no separate SELECT
 * after the update to fetch the new balance.
 */
export async function deductTrialCredits(
  workspaceId: string,
  tokens: number
): Promise<{ success: boolean; newBalance: number }> {
  const rows = await db
    .update(trialCredits)
    .set({
      creditsRemaining: sql`GREATEST(${trialCredits.creditsRemaining} - ${tokens}, 0)`,
      creditsUsed: sql`${trialCredits.creditsUsed} + ${tokens}`,
      status: sql`CASE WHEN GREATEST(${trialCredits.creditsRemaining} - ${tokens}, 0) <= 0 THEN 'depleted' ELSE ${trialCredits.status} END`,
      depletedAt: sql`CASE WHEN GREATEST(${trialCredits.creditsRemaining} - ${tokens}, 0) <= 0 THEN NOW() ELSE ${trialCredits.depletedAt} END`,
    })
    .where(
      and(
        eq(trialCredits.workspaceId, workspaceId),
        eq(trialCredits.status, "active"),
        gt(trialCredits.creditsRemaining, 0)
      )
    )
    .returning()
    .execute();

  if (rows.length === 0) {
    return { success: false, newBalance: 0 };
  }

  return { success: true, newBalance: rows[0]?.creditsRemaining ?? 0 };
}
