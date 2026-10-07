/**
 * The queue against a real database: what a claimed row looks like to a
 * handler, and whether a failing job stops at `maxAttempts`. The unit
 * tests mock the claim, so neither the row shape nor the `timestamp`
 * round trip is visible to them.
 *
 * Runs only when TEST_PG_URL is set; DATABASE_URL must point at the same
 * database, because the queue queries through `@intelligo-dev/core/db`.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

import { drain, enqueue, pruneJobs } from "../index";
import type { Job } from "../db/schema";

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

d("job queue (integration)", () => {
  const client = new Client({ connectionString: PG_URL });
  const kind = `jobs-it-${Date.now()}`;

  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await client.query(`DELETE FROM jobs WHERE kind LIKE $1`, [`${kind}%`]);
    await client.end();
  });

  it("hands the handler a camelCase job with its own fields", async () => {
    const id = await enqueue({
      kind: `${kind}.shape`,
      payload: { n: 1 },
      maxAttempts: 4,
    });
    let seen: Job | undefined;

    await drain({ [`${kind}.shape`]: async (job) => void (seen = job) });

    expect(seen).toMatchObject({
      id,
      kind: `${kind}.shape`,
      payload: { n: 1 },
      attempts: 1,
      maxAttempts: 4,
      workspaceId: null,
    });
    expect(seen!.runAt).toBeInstanceOf(Date);
  });

  it("claims a job enqueued now, on any host time zone", async () => {
    await enqueue({ kind: `${kind}.due` });
    const result = await drain({ [`${kind}.due`]: async () => {} });
    expect(result.succeeded).toBe(1);
  });

  it("fails a job for good once it reaches maxAttempts", async () => {
    const id = await enqueue({ kind: `${kind}.fail`, maxAttempts: 1 });

    await drain({
      [`${kind}.fail`]: async () => {
        throw new Error("down");
      },
    });

    const { rows } = await client.query<{ status: string; attempts: number }>(
      `SELECT status, attempts FROM jobs WHERE id = $1`,
      [id]
    );
    expect(rows[0]).toEqual({ status: "failed", attempts: 1 });
  });

  it("claims a job its worker abandoned mid-run", async () => {
    const id = await enqueue({ kind: `${kind}.abandoned` });
    await client.query(
      `UPDATE jobs SET status = 'running', attempts = 1,
              started_at = (now() AT TIME ZONE 'utc') - interval '1 hour'
        WHERE id = $1`,
      [id]
    );

    const result = await drain({ [`${kind}.abandoned`]: async () => {} });

    expect(result.succeeded).toBe(1);
  });

  it("fails an abandoned job that has used its attempts instead of running it again", async () => {
    const id = await enqueue({ kind: `${kind}.killer`, maxAttempts: 2 });
    await client.query(
      `UPDATE jobs SET status = 'running', attempts = 2,
              started_at = (now() AT TIME ZONE 'utc') - interval '1 hour'
        WHERE id = $1`,
      [id]
    );
    let ran = false;

    await drain({ [`${kind}.killer`]: async () => void (ran = true) });

    expect(ran).toBe(false);
    const { rows } = await client.query<{ status: string }>(
      `SELECT status FROM jobs WHERE id = $1`,
      [id]
    );
    expect(rows[0]!.status).toBe("failed");
  });

  it("runs a job once when another worker claims it while it waits in a batch", async () => {
    const ids = [
      await enqueue({ kind: `${kind}.batch` }),
      await enqueue({ kind: `${kind}.batch` }),
    ];
    const ran: string[] = [];

    const result = await drain(
      {
        [`${kind}.batch`]: async (job) => {
          ran.push(job.id);
          if (ran.length > 1) return;
          // Another worker claims the job still waiting in this batch as
          // abandoned and finishes it.
          await client.query(
            `UPDATE jobs SET status = 'succeeded', attempts = attempts + 1,
                    started_at = (now() AT TIME ZONE 'utc') + interval '1 minute',
                    finished_at = (now() AT TIME ZONE 'utc')
              WHERE id = $1`,
            [ids.find((id) => id !== job.id)]
          );
        },
      },
      { limit: 2 }
    );

    expect(ran).toHaveLength(1);
    expect(result).toMatchObject({ claimed: 2, succeeded: 1 });
    const { rows } = await client.query<{ status: string }>(
      `SELECT status FROM jobs WHERE id = ANY($1)`,
      [ids]
    );
    expect(rows.map((r) => r.status)).toEqual(["succeeded", "succeeded"]);
  });

  it("leaves the outcome of a worker that reclaimed a running job", async () => {
    const id = await enqueue({ kind: `${kind}.reclaimed` });

    await drain({
      [`${kind}.reclaimed`]: async () => {
        await client.query(
          `UPDATE jobs SET started_at = (now() AT TIME ZONE 'utc') + interval '1 minute',
                  status = 'succeeded'
            WHERE id = $1`,
          [id]
        );
        throw new Error("late failure");
      },
    });

    const { rows } = await client.query<{
      status: string;
      last_error: string | null;
    }>(`SELECT status, last_error FROM jobs WHERE id = $1`, [id]);
    expect(rows[0]).toEqual({ status: "succeeded", last_error: null });
  });

  it("prunes succeeded and failed jobs past their cutoffs", async () => {
    const old = `(now() AT TIME ZONE 'utc') - interval '30 days'`;
    const ids = {
      succeeded: await enqueue({ kind: `${kind}.prune` }),
      failed: await enqueue({ kind: `${kind}.prune` }),
      recentFailed: await enqueue({ kind: `${kind}.prune` }),
      pending: await enqueue({ kind: `${kind}.prune-pending` }),
    };
    await client.query(
      `UPDATE jobs SET status = 'succeeded', finished_at = ${old} WHERE id = $1`,
      [ids.succeeded]
    );
    await client.query(
      `UPDATE jobs SET status = 'failed', finished_at = ${old} WHERE id = $1`,
      [ids.failed]
    );
    await client.query(
      `UPDATE jobs SET status = 'failed', finished_at = (now() AT TIME ZONE 'utc')
        WHERE id = $1`,
      [ids.recentFailed]
    );

    const deleted = await pruneJobs(new Date(Date.now() - 7 * 86_400_000));

    expect(deleted).toBeGreaterThanOrEqual(2);
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM jobs WHERE id = ANY($1)`,
      [Object.values(ids)]
    );
    expect(rows.map((r) => r.id).sort()).toEqual(
      [ids.recentFailed, ids.pending].sort()
    );
  });

  it("keeps failed jobs until their own cutoff when one is given", async () => {
    const id = await enqueue({ kind: `${kind}.prune-kept` });
    await client.query(
      `UPDATE jobs SET status = 'failed',
              finished_at = (now() AT TIME ZONE 'utc') - interval '10 days'
        WHERE id = $1`,
      [id]
    );

    await pruneJobs(new Date(Date.now() - 7 * 86_400_000), {
      failedBefore: new Date(Date.now() - 30 * 86_400_000),
    });

    const { rowCount } = await client.query(
      `SELECT 1 FROM jobs WHERE id = $1`,
      [id]
    );
    expect(rowCount).toBe(1);
  });

  it("puts back what it had no time to start, attempt unspent", async () => {
    const id = await enqueue({ kind: `${kind}.late` });

    const result = await drain(
      { [`${kind}.late`]: async () => {} },
      { deadlineMs: 0 }
    );

    expect(result.deferred).toBeGreaterThanOrEqual(1);
    const { rows } = await client.query<{ status: string; attempts: number }>(
      `SELECT status, attempts FROM jobs WHERE id = $1`,
      [id]
    );
    expect(rows[0]).toEqual({ status: "pending", attempts: 0 });
  });
});
