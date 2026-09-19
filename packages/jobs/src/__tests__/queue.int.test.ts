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

import { drain, enqueue } from "../index";
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
});
