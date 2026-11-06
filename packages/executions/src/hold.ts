/**
 * The execution row's record of its hold.
 */

import { db } from "@intelligo-dev/core/db";
import type { Money } from "@intelligo-dev/core/money";
import { and, eq, isNull, or, sql } from "drizzle-orm";

import { executions } from "./db/schema";

/**
 * Add `extension` to what a running execution's row says is held. The
 * sum is taken in the database, so overlapping extensions add up rather
 * than overwrite. A row that holds another currency cannot be summed and
 * keeps what it had.
 */
export async function recordExtendedHold(
  executionId: string,
  extension: Money
): Promise<void> {
  const { amount, currency } = extension;
  await db
    .update(executions)
    .set({
      reservedMicros: sql`coalesce(${executions.reservedMicros}, 0) + ${amount}`,
      currency,
    })
    .where(
      and(
        eq(executions.id, executionId),
        eq(executions.status, "running"),
        or(isNull(executions.currency), eq(executions.currency, currency))
      )
    );
}
