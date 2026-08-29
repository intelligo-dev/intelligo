/**
 * Read models over the executions table — for the product's usage UI
 * and, in Phase 5, the Intelligo admin console.
 */

import { db } from "@intelligo-dev/core/db";
import { and, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";

import { executions } from "./db/schema";

export type ListExecutionsOptions = {
  workspaceId?: string;
  userId?: string;
  capability?: string;
  status?: "running" | "settling" | "succeeded" | "failed" | "refused";
  /** Keyset pagination: rows started strictly before this. */
  before?: Date;
  limit?: number;
};

export async function listExecutions(options: ListExecutionsOptions = {}) {
  const filters = [
    options.workspaceId
      ? eq(executions.workspaceId, options.workspaceId)
      : undefined,
    options.userId ? eq(executions.userId, options.userId) : undefined,
    options.capability
      ? eq(executions.capability, options.capability)
      : undefined,
    options.status ? eq(executions.status, options.status) : undefined,
    options.before ? lt(executions.startedAt, options.before) : undefined,
  ].filter(Boolean);

  return db
    .select()
    .from(executions)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(executions.startedAt))
    .limit(Math.min(options.limit ?? 50, 500));
}

export async function getExecutionByRequestId(requestId: string) {
  const [row] = await db
    .select()
    .from(executions)
    .where(eq(executions.requestId, requestId))
    .limit(1);
  return row ?? null;
}

/**
 * Aggregate counts, tokens, and charge for a workspace over a window.
 * Refused executions are counted separately — they consumed no tokens
 * but they are the signal that a plan's limits are biting.
 */
export async function summarizeExecutions(
  workspaceId: string,
  window: { from: Date; to: Date }
) {
  const rows = await db
    .select({
      status: executions.status,
      count: sql<number>`count(*)`,
      totalTokens: sql<number>`coalesce(sum(${executions.totalTokens}), 0)`,
      chargedMnt: sql<number>`coalesce(sum(${executions.chargedMnt}), 0)`,
    })
    .from(executions)
    .where(
      and(
        eq(executions.workspaceId, workspaceId),
        gte(executions.startedAt, window.from),
        lte(executions.startedAt, window.to)
      )
    )
    .groupBy(executions.status);

  const byStatus = Object.fromEntries(
    rows.map((r) => [
      r.status,
      {
        count: Number(r.count),
        totalTokens: Number(r.totalTokens),
        chargedMnt: Number(r.chargedMnt),
      },
    ])
  );

  return {
    byStatus,
    totals: rows.reduce(
      (acc, r) => ({
        count: acc.count + Number(r.count),
        totalTokens: acc.totalTokens + Number(r.totalTokens),
        chargedMnt: acc.chargedMnt + Number(r.chargedMnt),
      }),
      { count: 0, totalTokens: 0, chargedMnt: 0 }
    ),
  };
}

/**
 * Per-day totals for a workspace over a window — the read model behind
 * a usage chart.
 *
 * Aggregated in SQL rather than by bucketing rows in the application:
 * a month of a busy workspace is thousands of rows to ship over the
 * wire to produce thirty numbers, and any consumer that had to do that
 * bucketing itself would be writing the query this package should own.
 *
 * Days with no activity are absent rather than zero — the caller knows
 * the window it asked for, and a gap means "nothing ran", which a
 * chart should draw as zero and a table should leave empty. `date` is
 * a `YYYY-MM-DD` string in UTC, so the series is stable regardless of
 * where the reader is.
 */
export async function summarizeExecutionsByDay(
  workspaceId: string,
  window: { from: Date; to: Date }
): Promise<
  Array<{
    date: string;
    count: number;
    totalTokens: number;
    chargedMnt: number;
  }>
> {
  const day = sql<string>`to_char(${executions.startedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

  const rows = await db
    .select({
      date: day,
      count: sql<number>`count(*)`,
      totalTokens: sql<number>`coalesce(sum(${executions.totalTokens}), 0)`,
      chargedMnt: sql<number>`coalesce(sum(${executions.chargedMnt}), 0)`,
    })
    .from(executions)
    .where(
      and(
        eq(executions.workspaceId, workspaceId),
        gte(executions.startedAt, window.from),
        lte(executions.startedAt, window.to)
      )
    )
    .groupBy(day)
    .orderBy(day);

  return rows.map((row) => ({
    date: row.date,
    count: Number(row.count),
    totalTokens: Number(row.totalTokens),
    chargedMnt: Number(row.chargedMnt),
  }));
}

/**
 * Executions stuck in a non-terminal state past a cutoff — a stream
 * that died without reaching complete()/fail() (`running`), or a
 * settlement that threw partway (`settling`). The cleanup cron reports
 * these; they are the operational signal that usage went unrecorded.
 */
export async function findStaleExecutions(olderThan: Date, limit = 100) {
  return db
    .select()
    .from(executions)
    .where(
      and(
        inArray(executions.status, ["running", "settling"]),
        lt(executions.startedAt, olderThan)
      )
    )
    .orderBy(desc(executions.startedAt))
    .limit(limit);
}
