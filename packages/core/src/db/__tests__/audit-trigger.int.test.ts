/**
 * Integration test for the user_memory_audit append-only trigger.
 *
 * Runs only when TEST_PG_URL is set so CI (which doesn't provision a
 * Postgres) skips cleanly. Point it at the local docker-compose
 * Postgres to run it against a real DB:
 *
 *   TEST_PG_URL=postgres://postgres:postgres@localhost:5445/intelligo \
 *     pnpm vitest run packages/core/src/db/__tests__/audit-trigger.int.test.ts
 *
 * Why an integration test here: the append-only guard is enforced by
 * a Postgres trigger (migration 0018 + errcode fix 0025), not by
 * application code — a drizzle-mock-based test can't observe the
 * trigger at all. A future PR could silently drop the trigger in a
 * migration and every unit test would still pass; this test is the
 * only regression tripwire.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

d("user_memory_audit append-only trigger", () => {
  const client = new Client({ connectionString: PG_URL });
  const rowId = `audit-it-${Date.now()}`;
  let userId = "";
  let workspaceId = "";

  beforeAll(async () => {
    await client.connect();

    // Create our own user and workspace rather than borrowing whatever
    // the database happens to contain. The previous version required a
    // seeded database and therefore failed against the empty, freshly
    // migrated one CI runs it on — a test that depends on ambient data
    // is a test that only runs somewhere.
    const suffix = Date.now();
    userId = `audit-it-user-${suffix}`;
    workspaceId = `audit-it-ws-${suffix}`;

    await client.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'Audit IT', $2, true, now(), now())`,
      [userId, `audit-it-${suffix}@example.test`]
    );
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at, updated_at)
       VALUES ($1, 'Audit IT WS', $2, now(), now())`,
      [workspaceId, `audit-it-${suffix}`]
    );

    await client.query(
      `INSERT INTO user_memory_audit
         (id, user_id, workspace_id, target_kind, target_id, action, actor_kind)
       VALUES ($1, $2, $3, 'fact', 'test-target', 'create', 'system_job')`,
      [rowId, userId, workspaceId]
    );
  });

  afterAll(async () => {
    // The audit row itself cannot be deleted — that is what the
    // trigger under test enforces — so the fixture user and workspace
    // stay too, since the row references them. Both are keyed by
    // timestamp, so repeated runs do not collide.
    await client.end();
  });

  it("rejects UPDATE with ERRCODE P0001 raise_exception", async () => {
    await expect(
      client.query(
        `UPDATE user_memory_audit SET reason = 'mutated' WHERE id = $1`,
        [rowId]
      )
    ).rejects.toMatchObject({
      code: "P0001",
      message: expect.stringContaining("append-only"),
    });
  });

  it("rejects DELETE with ERRCODE P0001 raise_exception", async () => {
    await expect(
      client.query(`DELETE FROM user_memory_audit WHERE id = $1`, [rowId])
    ).rejects.toMatchObject({
      code: "P0001",
      message: expect.stringContaining("append-only"),
    });
  });

  it("allows INSERT of fresh audit rows", async () => {
    const freshId = `${rowId}-fresh`;
    await client.query(
      `INSERT INTO user_memory_audit
         (id, user_id, workspace_id, target_kind, target_id, action, actor_kind)
       VALUES ($1, $2, $3, 'memory', 'test-target-2', 'create', 'system_job')`,
      [freshId, userId, workspaceId]
    );
    const res = await client.query<{ id: string }>(
      `SELECT id FROM user_memory_audit WHERE id = $1`,
      [freshId]
    );
    expect(res.rows[0]?.id).toBe(freshId);
  });
});
