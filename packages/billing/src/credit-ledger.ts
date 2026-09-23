/**
 * Adding purchased credit to a workspace's ledger — the one write every
 * paid grant of credit goes through, whichever provider took the money.
 */

import { sql } from "drizzle-orm";

import type { db } from "@intelligo-dev/core/db";
import { creditBalances } from "@intelligo-dev/core/db/schema";
import type { Money } from "@intelligo-dev/core/money";

/** A transaction handle, so the credit lands atomically with its claim. */
export type LedgerTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Credit `grant` to `workspaceId`'s balance and its purchased total,
 * creating the ledger in the grant's currency when the workspace has
 * none.
 *
 * Returns false, and writes nothing, when the workspace's ledger is
 * denominated in another currency: adding one currency to another is
 * never this function's decision. The caller rolls back whatever claim
 * it made in the same transaction.
 */
export async function creditPurchasedBalance(
  tx: LedgerTx,
  workspaceId: string,
  grant: Money
): Promise<boolean> {
  const amount = grant.amount;
  const credited = await tx
    .insert(creditBalances)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      balanceMicros: amount,
      totalPurchasedMicros: amount,
      currency: grant.currency,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: creditBalances.workspaceId,
      set: {
        balanceMicros: sql`${creditBalances.balanceMicros} + ${amount}`,
        totalPurchasedMicros: sql`${creditBalances.totalPurchasedMicros} + ${amount}`,
        updatedAt: new Date(),
      },
      setWhere: sql`${creditBalances.currency} = ${grant.currency}`,
    })
    .returning({ id: creditBalances.id });
  return credited.length > 0;
}
