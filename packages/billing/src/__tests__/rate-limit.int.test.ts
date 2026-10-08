/**
 * Rate limiting against a real database: concurrent upserts on one
 * window admit exactly `limit`, a subject need not be a workspace, and
 * cleanup keeps a window that is still open.
 *
 * Runs only when TEST_PG_URL is set. DATABASE_URL must point at the
 * same database.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

d("rate limit (integration)", () => {
  const client = new Client({ connectionString: PG_URL });
  const subject = `ip:rate-it-${Date.now()}`;
  let check: typeof import("../rate-limit").checkRateLimit;
  let cleanup: typeof import("../rate-limit").cleanupRateLimitEntries;

  beforeAll(async () => {
    await client.connect();
    ({ checkRateLimit: check, cleanupRateLimitEntries: cleanup } =
      await import("../rate-limit"));
  });

  afterAll(async () => {
    await client.query(
      `DELETE FROM rate_limit_entries WHERE workspace_id = $1`,
      [subject]
    );
    await client.end();
  });

  it("admits exactly the limit of a concurrent burst in a one-hour window, and cleanup keeps it", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        check(subject, { endpoint: "export", limit: 3, windowMs: 3_600_000 })
      )
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(3);

    await cleanup();
    const { rows } = await client.query<{ count: number }>(
      `SELECT count FROM rate_limit_entries WHERE workspace_id = $1`,
      [subject]
    );
    expect(rows).toEqual([{ count: 8 }]);
  });

  it("deletes a closed-window backlog larger than one batch, and counts it", async () => {
    const stale = `${subject}-stale`;
    await client.query(
      `INSERT INTO rate_limit_entries (id, workspace_id, endpoint, minute_bucket, window_seconds, count)
       SELECT $1 || g, $1, 'chat', now() - interval '1 day' - g * interval '1 minute', 60, 1
         FROM generate_series(1, 25) g`,
      [stale]
    );
    const { deleteInBatches } = await import("../batched-delete");
    const { rateLimitEntries } = await import("@intelligo-dev/core/db/schema");
    const { eq } = await import("drizzle-orm");

    await expect(
      deleteInBatches(
        rateLimitEntries,
        eq(rateLimitEntries.workspaceId, stale),
        10
      )
    ).resolves.toBe(25);
    const { rows } = await client.query(
      `SELECT 1 FROM rate_limit_entries WHERE workspace_id = $1`,
      [stale]
    );
    expect(rows).toEqual([]);
  });
});
