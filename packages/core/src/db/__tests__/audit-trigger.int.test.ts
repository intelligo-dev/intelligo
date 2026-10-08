/**
 * The user_memory_audit append-only guard is a Postgres trigger, which no
 * mocked test can observe. Runs only when TEST_PG_URL is set:
 *
 *   TEST_PG_URL=postgres://postgres:postgres@localhost:5445/intelligo \
 *     pnpm vitest run packages/core/src/db/__tests__/audit-trigger.int.test.ts
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

    // Own fixtures, so the test runs against an empty, freshly migrated
    // database.
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

  // The audit rows cannot be deleted — that is what the trigger under
  // test enforces — but their user and workspace can: the rows stay,
  // with both references cleared.
  afterAll(async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [workspaceId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
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

  it("allows clearing the columns that describe a person, and nothing else", async () => {
    const erasedId = `${rowId}-erased`;
    await client.query(
      `INSERT INTO user_memory_audit
         (id, user_id, workspace_id, target_kind, target_id, action, actor_kind,
          actor_id, before_value, after_value, reason)
       VALUES ($1, $2, $3, 'fact', 'fact-1', 'update', 'user', $2,
               '{"value":"before"}', '{"value":"after"}', 'user edit')`,
      [erasedId, userId, workspaceId]
    );

    await expect(
      client.query(
        `UPDATE user_memory_audit SET before_value = '{"value":"other"}' WHERE id = $1`,
        [erasedId]
      )
    ).rejects.toMatchObject({ code: "P0001" });
    await expect(
      client.query(
        `UPDATE user_memory_audit SET user_id = NULL, action = 'delete' WHERE id = $1`,
        [erasedId]
      )
    ).rejects.toMatchObject({ code: "P0001" });

    await client.query(
      `UPDATE user_memory_audit
          SET user_id = NULL, actor_id = NULL, before_value = NULL,
              after_value = NULL, reason = NULL
        WHERE id = $1`,
      [erasedId]
    );
    const { rows } = await client.query(
      `SELECT user_id, workspace_id, actor_id, before_value, after_value,
              reason, target_id, action
         FROM user_memory_audit WHERE id = $1`,
      [erasedId]
    );
    expect(rows).toEqual([
      {
        user_id: null,
        workspace_id: workspaceId,
        actor_id: null,
        before_value: null,
        after_value: null,
        reason: null,
        target_id: "fact-1",
        action: "update",
      },
    ]);
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

d("audit_events append-only trigger", () => {
  const client = new Client({ connectionString: PG_URL });
  const suffix = Date.now();
  const rowId = `audit-events-it-${suffix}`;
  const workspaceId = `audit-events-ws-${suffix}`;

  beforeAll(async () => {
    await client.connect();
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at, updated_at)
       VALUES ($1, 'Audit Events IT WS', $2, now(), now())`,
      [workspaceId, `audit-events-${suffix}`]
    );
    await client.query(
      `INSERT INTO audit_events (id, workspace_id, actor_kind, action, resource_kind)
       VALUES ($1, $2, 'system', 'test.event', 'test')`,
      [rowId, workspaceId]
    );
  });

  afterAll(async () => {
    await client.end();
  });

  it("rejects UPDATE with ERRCODE P0001", async () => {
    await expect(
      client.query(`UPDATE audit_events SET outcome = 'failed' WHERE id = $1`, [
        rowId,
      ])
    ).rejects.toMatchObject({
      code: "P0001",
      message: expect.stringContaining("append-only"),
    });
  });

  it("rejects DELETE with ERRCODE P0001", async () => {
    await expect(
      client.query(`DELETE FROM audit_events WHERE id = $1`, [rowId])
    ).rejects.toMatchObject({ code: "P0001" });
  });

  it("allows the actor's email to be cleared, and to be changed to nothing else", async () => {
    const emailRowId = `${rowId}-email`;
    await client.query(
      `INSERT INTO audit_events (id, workspace_id, actor_email, actor_kind, action, resource_kind)
       VALUES ($1, $2, 'someone@example.test', 'user', 'test.event', 'test')`,
      [emailRowId, workspaceId]
    );
    await expect(
      client.query(
        `UPDATE audit_events SET actor_email = 'other@example.test' WHERE id = $1`,
        [emailRowId]
      )
    ).rejects.toMatchObject({ code: "P0001" });
    await expect(
      client.query(
        `UPDATE audit_events SET actor_email = NULL, outcome = 'failed' WHERE id = $1`,
        [emailRowId]
      )
    ).rejects.toMatchObject({ code: "P0001" });

    await client.query(
      `UPDATE audit_events SET actor_email = NULL WHERE id = $1`,
      [emailRowId]
    );
    const { rows } = await client.query(
      `SELECT actor_email, action FROM audit_events WHERE id = $1`,
      [emailRowId]
    );
    expect(rows).toEqual([{ actor_email: null, action: "test.event" }]);
  });

  it("keeps the row, with workspace_id nulled, when its workspace is deleted", async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [workspaceId]);
    const { rows } = await client.query<{ workspace_id: string | null }>(
      `SELECT workspace_id FROM audit_events WHERE id = $1`,
      [rowId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.workspace_id).toBeNull();
  });
});
