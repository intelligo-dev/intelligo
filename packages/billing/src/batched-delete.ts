/**
 * Deleting stale rows in bounded batches, for the maintenance cleanups.
 * Each batch is one statement over at most `batchSize` rows, and only
 * the count comes back, so a large backlog neither ships every deleted
 * row to the process nor holds one long delete.
 */

import { sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { db } from "@intelligo-dev/core/db";

export const CLEANUP_BATCH_SIZE = 5_000;

/** Delete every row of `table` matching `where`; returns how many went. */
export async function deleteInBatches(
  table: PgTable,
  where: SQL,
  batchSize: number = CLEANUP_BATCH_SIZE
): Promise<number> {
  let total = 0;
  for (;;) {
    const result = await db.execute(
      sql`DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM ${table} WHERE ${where} LIMIT ${batchSize})`
    );
    const deleted = result.rowCount ?? 0;
    total += deleted;
    if (deleted < batchSize) return total;
  }
}
