/**
 * What deleting a user or a workspace does to the rows that reference
 * them — a foreign key's ON DELETE action and the audit triggers, which
 * only a real Postgres can observe. Runs only when TEST_PG_URL is set:
 *
 *   TEST_PG_URL=postgres://postgres:postgres@localhost:5445/intelligo \
 *     pnpm vitest run packages/core/src/db/__tests__/user-deletion.int.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

d("deleting a user or a workspace", () => {
  const client = new Client({ connectionString: PG_URL });
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const userId = `deletion-it-user-${suffix}`;
  const workspaceId = `deletion-it-ws-${suffix}`;
  const auditId = `deletion-it-audit-${suffix}`;
  const usageId = `deletion-it-usage-${suffix}`;
  const notificationId = `deletion-it-notification-${suffix}`;

  beforeAll(async () => {
    await client.connect();
    await client.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'Deletion IT', $2, true, now(), now())`,
      [userId, `deletion-it-${suffix}@example.test`]
    );
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at, updated_at)
       VALUES ($1, 'Deletion IT WS', $2, now(), now())`,
      [workspaceId, `deletion-it-${suffix}`]
    );
    await client.query(
      `INSERT INTO user_memory_audit
         (id, user_id, workspace_id, target_kind, target_id, action, actor_kind, actor_id)
       VALUES ($1, $2, $3, 'snapshot', $2, 'export', 'user', $2)`,
      [auditId, userId, workspaceId]
    );
    await client.query(
      `INSERT INTO usage_records (id, workspace_id, user_id, type, total_tokens)
       VALUES ($1, $2, $3, 'ai_tokens', 10)`,
      [usageId, workspaceId, userId]
    );
    await client.query(
      `INSERT INTO notifications (id, user_id, workspace_id, type, title, message)
       VALUES ($1, $2, $3, 'test', 'Title', 'Message')`,
      [notificationId, userId, workspaceId]
    );
  });

  afterAll(async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [workspaceId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await client.end();
  });

  it("deletes the user and keeps their memory-audit and usage rows, unattributed", async () => {
    await client.query(`DELETE FROM users WHERE id = $1`, [userId]);

    const audit = await client.query<{ user_id: string | null }>(
      `SELECT user_id FROM user_memory_audit WHERE id = $1`,
      [auditId]
    );
    expect(audit.rows).toEqual([{ user_id: null }]);

    const usage = await client.query<{ user_id: string | null }>(
      `SELECT user_id FROM usage_records WHERE id = $1`,
      [usageId]
    );
    expect(usage.rows).toEqual([{ user_id: null }]);

    const notifications = await client.query(
      `SELECT id FROM notifications WHERE id = $1`,
      [notificationId]
    );
    expect(notifications.rows).toEqual([]);
  });

  it("deletes the workspace and keeps its memory-audit rows", async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [workspaceId]);

    const audit = await client.query<{ workspace_id: string | null }>(
      `SELECT workspace_id FROM user_memory_audit WHERE id = $1`,
      [auditId]
    );
    expect(audit.rows).toEqual([{ workspace_id: null }]);
  });
});

d("notifications of a deleted workspace", () => {
  const client = new Client({ connectionString: PG_URL });
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const userId = `notify-it-user-${suffix}`;
  const workspaceId = `notify-it-ws-${suffix}`;

  beforeAll(async () => {
    await client.connect();
    await client.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'Notify IT', $2, true, now(), now())`,
      [userId, `notify-it-${suffix}@example.test`]
    );
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at, updated_at)
       VALUES ($1, 'Notify IT WS', $2, now(), now())`,
      [workspaceId, `notify-it-${suffix}`]
    );
  });

  afterAll(async () => {
    await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await client.end();
  });

  it("are deleted with it; the user's other notifications stay", async () => {
    await client.query(
      `INSERT INTO notifications (id, user_id, workspace_id, type, title, message)
       VALUES ($1, $2, $3, 'test', 'T', 'M'), ($4, $2, NULL, 'test', 'T', 'M')`,
      [`${suffix}-ws`, userId, workspaceId, `${suffix}-user`]
    );
    await client.query(`DELETE FROM organization WHERE id = $1`, [workspaceId]);
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM notifications WHERE user_id = $1`,
      [userId]
    );
    expect(rows.map((r) => r.id)).toEqual([`${suffix}-user`]);
  });

  it("pruning deletes old read notifications and keeps unread and recent ones", async () => {
    process.env.DATABASE_URL = PG_URL;
    const { pruneNotifications } = await import("../../notifications");
    await client.query(
      `INSERT INTO notifications (id, user_id, type, title, message, is_read, created_at)
       VALUES ($2, $1, 'test', 'T', 'M', true, now() - interval '100 days'),
              ($3, $1, 'test', 'T', 'M', false, now() - interval '100 days'),
              ($4, $1, 'test', 'T', 'M', true, now())`,
      [userId, `${suffix}-old-read`, `${suffix}-old-unread`, `${suffix}-new`]
    );
    await pruneNotifications(new Date(Date.now() - 90 * 24 * 60 * 60_000));
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM notifications WHERE id LIKE $1 ORDER BY id`,
      [`${suffix}-%`]
    );
    expect(rows.map((r) => r.id)).toEqual([
      `${suffix}-new`,
      `${suffix}-old-unread`,
      `${suffix}-user`,
    ]);
  });

  it("refuses a notification for a user that does not exist", async () => {
    await expect(
      client.query(
        `INSERT INTO notifications (id, user_id, type, title, message)
         VALUES ($1, 'no-such-user', 'test', 'T', 'M')`,
        [`${suffix}-orphan`]
      )
    ).rejects.toMatchObject({ code: "23503" });
  });
});

d("counters and amounts past 32 bits", () => {
  const client = new Client({ connectionString: PG_URL });
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workspaceId = `wide-it-ws-${suffix}`;

  beforeAll(async () => {
    await client.connect();
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at, updated_at)
       VALUES ($1, 'Wide IT WS', $2, now(), now())`,
      [workspaceId, `wide-it-${suffix}`]
    );
  });

  afterAll(async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [workspaceId]);
    await client.end();
  });

  it("a month's token count passes 2^31", async () => {
    await client.query(
      `INSERT INTO monthly_usage (id, workspace_id, period_start, period_end, tokens_used)
       VALUES ($1, $2, now(), now(), 2147483000)`,
      [`${suffix}-mu`, workspaceId]
    );
    await client.query(
      `UPDATE monthly_usage SET tokens_used = tokens_used + 1000000 WHERE id = $1`,
      [`${suffix}-mu`]
    );
    const { rows } = await client.query<{ tokens_used: string }>(
      `SELECT tokens_used FROM monthly_usage WHERE id = $1`,
      [`${suffix}-mu`]
    );
    expect(rows[0]!.tokens_used).toBe("2148483000");
  });

  it("an event, an invoice and a purchase hold an amount past 2^31 minor units", async () => {
    const amount = 2_150_000_000;
    await client.query(
      `INSERT INTO finance_events (id, workspace_id, stripe_event_id, type, amount_minor)
       VALUES ($1, $2, $1, 'invoice.paid', $3)`,
      [`${suffix}-fe`, workspaceId, amount]
    );
    await client.query(
      `INSERT INTO payments (id, provider, workspace_id, reference, amount_minor, currency)
       VALUES ($1, 'test', $2, 'pro', $3, 'IDR')`,
      [`${suffix}-pay`, workspaceId, amount]
    );
    await client.query(
      `INSERT INTO credit_purchases (id, workspace_id, price_minor)
       VALUES ($1, $2, $3)`,
      [`${suffix}-cp`, workspaceId, amount]
    );
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM finance_events WHERE id = $1 AND amount_minor = $2`,
      [`${suffix}-fe`, amount]
    );
    expect(rows[0]!.n).toBe("1");
  });
});
