/**
 * Read models over the executions table, for the product's usage UI
 * and the admin console.
 */

import { db } from "@intelligo-dev/core/db";
import { money, type Money } from "@intelligo-dev/core/money";
import { and, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";

import { executions } from "./db/schema";

/**
 * Charges summed per currency.
 *
 * A workspace bills in one currency, so this is normally one entry —
 * but the rows are what the ledger holds, and adding two currencies
 * into a single number is how a total starts lying. Rows with no
 * currency are executions that were never charged.
 */
function chargedByCurrency(
  rows: ReadonlyArray<{ currency: string | null; chargedMicros: unknown }>
): Money[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.currency) continue;
    // `sum()` of a bigint column arrives as a string.
    const amount = Number(row.chargedMicros ?? 0);
    if (amount === 0) continue;
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + amount);
  }
  return [...totals].map(([code, amount]) => money(amount, code));
}

export type ListExecutionsOptions = {
  /** Required: every query is scoped to one tenant. */
  workspaceId: string;
  userId?: string;
  capability?: string;
  status?: "running" | "settling" | "succeeded" | "failed" | "refused";
  /** Keyset pagination: rows started strictly before this. */
  before?: Date;
  limit?: number;
};

export async function listExecutions(options: ListExecutionsOptions) {
  const filters = [
    eq(executions.workspaceId, options.workspaceId),
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
      currency: executions.currency,
      count: sql<number>`count(*)`,
      totalTokens: sql<number>`coalesce(sum(${executions.totalTokens}), 0)`,
      chargedMicros: sql<string>`coalesce(sum(${executions.chargedMicros}), 0)`,
    })
    .from(executions)
    .where(
      and(
        eq(executions.workspaceId, workspaceId),
        gte(executions.startedAt, window.from),
        lte(executions.startedAt, window.to)
      )
    )
    .groupBy(executions.status, executions.currency);

  // A status can arrive as several rows — one per currency — so the
  // per-status view folds them back together.
  const byStatus: Record<
    string,
    { count: number; totalTokens: number; charged: Money[] }
  > = {};
  for (const r of rows) {
    const seen = byStatus[r.status] ?? {
      count: 0,
      totalTokens: 0,
      charged: [],
    };
    byStatus[r.status] = {
      count: seen.count + Number(r.count),
      totalTokens: seen.totalTokens + Number(r.totalTokens),
      charged: chargedByCurrency(rows.filter((row) => row.status === r.status)),
    };
  }

  return {
    byStatus,
    totals: {
      ...rows.reduce(
        (acc, r) => ({
          count: acc.count + Number(r.count),
          totalTokens: acc.totalTokens + Number(r.totalTokens),
        }),
        { count: 0, totalTokens: 0 }
      ),
      charged: chargedByCurrency(rows),
    },
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
 * chart should draw as zero and a table should leave empty.
 *
 * `date` is a `YYYY-MM-DD` string in `timeZone`, which defaults to UTC.
 * Pass the reader's own zone: bucketing a +08:00 reader's 00:36 turn in
 * UTC files it on the previous day.
 */
export async function summarizeExecutionsByDay(
  workspaceId: string,
  window: { from: Date; to: Date },
  options: { timeZone?: string } = {}
): Promise<
  Array<{
    date: string;
    count: number;
    totalTokens: number;
    charged: Money[];
  }>
> {
  // Bound, not interpolated: the zone reaches here from a cookie the
  // browser wrote, so it is caller input like any other.
  //
  // Two conversions, both needed. `started_at` is a naive timestamp
  // holding a UTC instant, so `AT TIME ZONE 'UTC'` turns it into an
  // instant, and the second `AT TIME ZONE` reads that instant as wall
  // time where the reader is. One conversion would instead *declare*
  // the stored time to be the reader's, which is a different moment.
  const timeZone = options.timeZone ?? "UTC";
  const day = sql<string>`to_char(${executions.startedAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`;

  const rows = await db
    .select({
      date: day,
      currency: executions.currency,
      count: sql<number>`count(*)`,
      totalTokens: sql<number>`coalesce(sum(${executions.totalTokens}), 0)`,
      chargedMicros: sql<string>`coalesce(sum(${executions.chargedMicros}), 0)`,
    })
    .from(executions)
    .where(
      and(
        eq(executions.workspaceId, workspaceId),
        gte(executions.startedAt, window.from),
        lte(executions.startedAt, window.to)
      )
    )
    // By ordinal, not by the expression: drizzle inlines the fragment
    // again for each clause, and with the zone bound as a parameter
    // that makes three *different* expressions — Postgres then refuses
    // the grouping. A literal zone matched textually and hid this.
    .groupBy(sql`1`, executions.currency)
    .orderBy(sql`1`);

  // One row per day and currency; the series a chart draws is per day.
  const byDay = new Map<string, (typeof rows)[number][]>();
  for (const row of rows) {
    byDay.set(row.date, [...(byDay.get(row.date) ?? []), row]);
  }

  return [...byDay].map(([date, dayRows]) => ({
    date,
    count: dayRows.reduce((sum, row) => sum + Number(row.count), 0),
    totalTokens: dayRows.reduce((sum, row) => sum + Number(row.totalTokens), 0),
    charged: chargedByCurrency(dayRows),
  }));
}

/**
 * Executions stuck in a non-terminal state past a cutoff.
 *
 * `running`: the stream died without reaching complete()/fail() —
 * tokens were consumed and nothing was charged. `settling`: the charge
 * was claimed but never confirmed — EITHER `settleUsage` threw and the
 * workspace was not charged, OR the charge committed and the process
 * died before the final `settling → succeeded` flip, in which case the
 * workspace WAS charged. A `usage_records` row (or a `settled`
 * reservation) for the same `requestId` distinguishes the two. This
 * only reports; nothing in the framework repairs these rows.
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
