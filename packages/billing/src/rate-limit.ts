/**
 * Database-backed rate limiting.
 *
 * Fixed-window (per-minute bucket) rate limiting using the
 * rate_limit_entries table. One row per (workspace, endpoint, minute
 * bucket); each request upserts the row and atomically increments its
 * counter, so N concurrent requests observe counts 1..N and exactly
 * `limit` of them are admitted. Per-plan ceilings come from the plan
 * registry (`getRateLimit`).
 *
 * `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`
 * is race-safe: the returned count is this request's position in the
 * bucket. Old buckets are removed by the cleanup cron
 * (cleanupRateLimitEntries).
 */

import { db } from "@intelligo-dev/core/db";
import { rateLimitEntries } from "@intelligo-dev/core/db/schema";
import { lt, sql } from "drizzle-orm";
import { getRateLimit } from "./plan-registry";

// ---------------------------------------------------------------------------
// Rate Limit Configuration
// ---------------------------------------------------------------------------

/** An unregistered plan gets `DEFAULT_REQUESTS_PER_MINUTE`. */
export { DEFAULT_REQUESTS_PER_MINUTE } from "./plan-registry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds?: number;
};

// ---------------------------------------------------------------------------
// checkRateLimit
// ---------------------------------------------------------------------------

/**
 * Check whether a workspace is within its rate limit for the given plan.
 *
 * 1. Compute the current minute bucket (floored to the minute)
 * 2. Upsert the bucket row, incrementing `count` atomically
 * 3. The RETURNING count is this request's position in the bucket:
 *    allowed while `count <= limit`.
 */
export async function checkRateLimit(
  workspaceId: string,
  planSlug: string
): Promise<RateLimitResult> {
  const limit = getRateLimit(undefined, planSlug);

  const now = Date.now();
  const bucketStartMs = Math.floor(now / 60_000) * 60_000;
  const minuteBucket = new Date(bucketStartMs);
  // The window resets at the next minute boundary, not 60s from "now".
  const resetAt = new Date(bucketStartMs + 60_000);

  const rows = await db
    .insert(rateLimitEntries)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      endpoint: "chat",
      requestedAt: new Date(now),
      minuteBucket,
    })
    .onConflictDoUpdate({
      target: [
        rateLimitEntries.workspaceId,
        rateLimitEntries.endpoint,
        rateLimitEntries.minuteBucket,
      ],
      set: {
        count: sql`${rateLimitEntries.count} + 1`,
        requestedAt: new Date(now),
      },
    })
    .returning();

  const count = rows[0]?.count ?? 1;

  if (count > limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((resetAt.getTime() - now) / 1000)
      ),
    };
  }

  return {
    allowed: true,
    limit,
    remaining: limit - count,
    resetAt,
  };
}

// ---------------------------------------------------------------------------
// cleanupRateLimitEntries
// ---------------------------------------------------------------------------

/**
 * Delete rate limit buckets older than 2 minutes (buffer beyond the
 * 1-minute window). Called from the cleanup cron route.
 *
 * @returns Count of deleted rows
 */
export async function cleanupRateLimitEntries(): Promise<number> {
  const cutoff = new Date(Date.now() - 120_000); // 2 minutes ago

  const deleted = await db
    .delete(rateLimitEntries)
    .where(lt(rateLimitEntries.requestedAt, cutoff))
    .returning();

  return deleted.length;
}
