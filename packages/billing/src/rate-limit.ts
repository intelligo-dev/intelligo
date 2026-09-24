/**
 * Database-backed rate limiting.
 *
 * Fixed-window rate limiting using the rate_limit_entries table. One
 * row per (subject, endpoint, bucket); each request upserts the row and atomically increments its
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
import { sql } from "drizzle-orm";
import { getRateLimit } from "./plan-registry";

// ---------------------------------------------------------------------------
// Rate Limit Configuration
// ---------------------------------------------------------------------------

/** An unregistered plan gets `DEFAULT_REQUESTS_PER_MINUTE`. */
export { DEFAULT_REQUESTS_PER_MINUTE } from "./plan-registry";

/** The bucket `checkRateLimit` counts in when the caller names none. */
export const DEFAULT_RATE_LIMIT_ENDPOINT = "chat";

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

export type RateLimitOptions = {
  /** Names the counter; callers passing the same name share it. Default `"chat"`. */
  endpoint?: string;
  /** The window's length. Default one minute. */
  windowMs?: number;
  /** Requests admitted per window. */
  limit?: number;
  /** Take the limit from this plan's per-minute rate instead. */
  planSlug?: string;
};

/**
 * Check whether a workspace is within its rate limit for the given plan.
 *
 * 1. Compute the current minute bucket (floored to the minute)
 * 2. Upsert the bucket row, incrementing `count` atomically
 * 3. The RETURNING count is this request's position in the bucket:
 *    allowed while `count <= limit`.
 *
 * `endpoint` names the bucket. Callers that pass the same name share
 * one counter per workspace and minute; a route that should not eat
 * into chat's allowance passes its own.
 */
export function checkRateLimit(
  workspaceId: string,
  planSlug: string,
  endpoint?: string
): Promise<RateLimitResult>;
/**
 * Check a subject against `limit` requests per `windowMs`. The subject
 * is any key — a workspace id, or a hashed IP for callers nobody signed
 * in as; the framework stores it as given, so hash what should not be
 * kept. Pass `limit`, or `planSlug` for that plan's per-minute rate
 * (with the default one-minute window only).
 *
 * Windows are fixed and aligned to the Unix epoch in UTC: a day window
 * resets at 00:00 UTC, not at the caller's midnight.
 */
export function checkRateLimit(
  subject: string,
  options: RateLimitOptions
): Promise<RateLimitResult>;
export async function checkRateLimit(
  subject: string,
  planOrOptions: string | RateLimitOptions,
  endpointArg?: string
): Promise<RateLimitResult> {
  const options: RateLimitOptions =
    typeof planOrOptions === "string"
      ? { planSlug: planOrOptions, endpoint: endpointArg }
      : planOrOptions;
  const endpoint = options.endpoint ?? DEFAULT_RATE_LIMIT_ENDPOINT;
  const windowMs = options.windowMs ?? 60_000;
  if (!Number.isInteger(windowMs) || windowMs < 1000 || windowMs % 1000 !== 0) {
    throw new Error(
      `A rate-limit window is a whole number of seconds, not ${windowMs} ms.`
    );
  }
  if (options.limit === undefined && options.planSlug === undefined) {
    throw new Error("checkRateLimit needs a limit or a planSlug.");
  }
  if (options.limit === undefined && windowMs !== 60_000) {
    throw new Error(
      "A plan's rate is per minute; pass a limit for any other window."
    );
  }
  const limit = options.limit ?? getRateLimit(undefined, options.planSlug!);

  const now = Date.now();
  const bucketStartMs = Math.floor(now / windowMs) * windowMs;
  const minuteBucket = new Date(bucketStartMs);
  // The window resets at its next boundary, not one window from "now".
  const resetAt = new Date(bucketStartMs + windowMs);

  // A longer window counts under its own key, so it never shares a row
  // with the minute window of the same endpoint.
  const windowSeconds = windowMs / 1000;
  const key = windowSeconds === 60 ? endpoint : `${endpoint}@${windowSeconds}s`;

  const rows = await db
    .insert(rateLimitEntries)
    .values({
      id: crypto.randomUUID(),
      workspaceId: subject,
      endpoint: key,
      requestedAt: new Date(now),
      minuteBucket,
      windowSeconds,
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
 * Delete buckets whose window ended more than a minute ago. Called from
 * the cleanup cron route.
 *
 * @returns Count of deleted rows
 */
export async function cleanupRateLimitEntries(): Promise<number> {
  // UTC wall clock, as drizzle writes the naive `timestamp` columns; a
  // Date bound in raw SQL would arrive as the server's local time.
  const cutoff = new Date(Date.now() - 60_000).toISOString();

  const deleted = await db
    .delete(rateLimitEntries)
    .where(
      sql`${rateLimitEntries.minuteBucket} + ${rateLimitEntries.windowSeconds} * interval '1 second' < ${cutoff}::timestamp`
    )
    .returning();

  return deleted.length;
}
