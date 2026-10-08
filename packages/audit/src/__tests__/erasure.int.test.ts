/**
 * Erasing a user from both audit trails, against a real database: the
 * append-only triggers decide what an UPDATE may change, so only
 * Postgres can say whether the erasure gets through and what it leaves.
 *
 * Runs only when TEST_PG_URL is set (with DATABASE_URL pointing at the
 * same database, which the db module reads).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";

import { db } from "@intelligo-dev/core/db";
import { eraseUserFromMemoryAudit } from "@intelligo-dev/core/identity";

import { eraseActorFromAuditEvents, recordAuditEventOrThrow } from "../index";

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

async function query(statement: SQL): Promise<Record<string, unknown>[]> {
  const result = await db.execute(statement);
  return result.rows as Record<string, unknown>[];
}

d("erasing a user from the audit trails (integration)", () => {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const userId = `erase-it-user-${suffix}`;
  const otherId = `erase-it-other-${suffix}`;
  const workspaceId = `erase-it-ws-${suffix}`;
  const email = `erase-it-${suffix}@example.test`;
  const ownRow = `${suffix}-own`;
  const actedRow = `${suffix}-acted`;

  beforeAll(async () => {
    for (const [id, address] of [
      [userId, email],
      [otherId, `erase-it-other-${suffix}@example.test`],
    ]) {
      await query(
        sql`INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
            VALUES (${id}, 'Erase IT', ${address}, true, now(), now())`
      );
    }
    await query(
      sql`INSERT INTO organization (id, name, slug, created_at, updated_at)
          VALUES (${workspaceId}, 'Erase IT WS', ${`erase-it-${suffix}`}, now(), now())`
    );
    await query(
      sql`INSERT INTO user_memory_audit
            (id, user_id, workspace_id, target_kind, target_id, action,
             actor_kind, actor_id, before_value, after_value, reason)
          VALUES
            (${ownRow}, ${userId}, ${workspaceId}, 'fact', 'fact-a', 'update',
             'user', ${userId}, '{"value":"private before"}',
             '{"value":"private after"}', 'edited'),
            (${actedRow}, ${otherId}, ${workspaceId}, 'fact', 'fact-b', 'update',
             'admin', ${userId}, '{"value":"theirs"}', NULL, 'support')`
    );
  });

  afterAll(async () => {
    await query(sql`DELETE FROM organization WHERE id = ${workspaceId}`);
    await query(sql`DELETE FROM users WHERE id IN (${userId}, ${otherId})`);
  });

  it("clears the user and what was recorded about them from the memory audit", async () => {
    expect(await eraseUserFromMemoryAudit(userId)).toBe(2);

    const rows = await query(
      sql`SELECT id, user_id, workspace_id, actor_id, before_value,
                 after_value, reason, target_id, action
            FROM user_memory_audit
           WHERE id IN (${actedRow}, ${ownRow}) ORDER BY id`
    );
    expect(rows).toEqual([
      {
        id: actedRow,
        user_id: otherId,
        workspace_id: workspaceId,
        actor_id: null,
        before_value: { value: "theirs" },
        after_value: null,
        reason: "support",
        target_id: "fact-b",
        action: "update",
      },
      {
        id: ownRow,
        user_id: null,
        workspace_id: workspaceId,
        actor_id: null,
        before_value: null,
        after_value: null,
        reason: null,
        target_id: "fact-a",
        action: "update",
      },
    ]);
  });

  it("clears the actor and their email from the events they acted in", async () => {
    await recordAuditEventOrThrow({
      workspaceId,
      actorId: userId,
      action: "test.erasure",
      resourceKind: "test",
      resourceId: suffix,
    });
    expect(
      await query(
        sql`SELECT actor_email FROM audit_events WHERE resource_id = ${suffix}`
      )
    ).toEqual([{ actor_email: email }]);

    expect(await eraseActorFromAuditEvents(userId)).toBe(1);

    expect(
      await query(
        sql`SELECT actor_id, actor_email, action FROM audit_events WHERE resource_id = ${suffix}`
      )
    ).toEqual([{ actor_id: null, actor_email: null, action: "test.erasure" }]);
  });
});
