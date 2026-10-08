/**
 * Purging accounts whose grace period has ended, and reading who owns a
 * workspace, against a real database: what the purge leaves behind is
 * decided by foreign keys and the audit triggers.
 *
 * Runs when TEST_PG_URL is set, with DATABASE_URL pointing at the same
 * database.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";

const d = process.env.TEST_PG_URL ? describe : describe.skip;

d("deleted accounts (integration)", () => {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const dueId = `purge-it-due-${suffix}`;
  const graceId = `purge-it-grace-${suffix}`;
  const ownerId = `purge-it-owner-${suffix}`;
  const workspaceId = `purge-it-ws-${suffix}`;
  const soloId = `purge-it-solo-${suffix}`;
  const day = 24 * 60 * 60 * 1000;

  let query: (statement: SQL) => Promise<Record<string, unknown>[]>;

  beforeAll(async () => {
    const { db } = await import("@intelligo-dev/core/db");
    query = async (statement) =>
      (await db.execute(statement)).rows as Record<string, unknown>[];

    for (const [id, deletedDaysAgo] of [
      [dueId, 31],
      [graceId, 2],
      [ownerId, null],
    ] as const) {
      await query(
        sql`INSERT INTO users (id, name, email, email_verified, deleted_at, created_at, updated_at)
            VALUES (${id}, 'Purge IT', ${`${id}@example.test`}, true,
                    ${deletedDaysAgo === null ? null : new Date(Date.now() - deletedDaysAgo * day)},
                    now(), now())`
      );
    }
    for (const [id, name] of [
      [workspaceId, "Purge IT WS"],
      [soloId, "Purge IT Solo"],
    ]) {
      await query(
        sql`INSERT INTO organization (id, name, slug, created_at, updated_at)
            VALUES (${id}, ${name}, ${id}, now(), now())`
      );
    }
    await query(
      sql`INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES
            (${`m-owner-${suffix}`}, ${workspaceId}, ${ownerId}, 'owner', now()),
            (${`m-due-${suffix}`}, ${workspaceId}, ${dueId}, 'admin,owner', now()),
            (${`m-solo-${suffix}`}, ${soloId}, ${ownerId}, 'owner', now())`
    );
    await query(
      sql`INSERT INTO usage_records (id, workspace_id, user_id, type, total_tokens)
          VALUES (${`usage-${suffix}`}, ${workspaceId}, ${dueId}, 'ai_tokens', 5)`
    );
    await query(
      sql`INSERT INTO conversations (id, workspace_id, user_id, agent_id, created_at, updated_at)
          VALUES (${`conv-${suffix}`}, ${workspaceId}, ${dueId}, 'assistant', now(), now())`
    );
    await query(
      sql`INSERT INTO user_memory_audit
            (id, user_id, workspace_id, target_kind, target_id, action, actor_kind, actor_id, before_value)
          VALUES (${`audit-${suffix}`}, ${dueId}, ${workspaceId}, 'fact', 'f-1', 'delete', 'user', ${dueId}, '{"value":"x"}')`
    );
  });

  afterAll(async () => {
    await query(
      sql`DELETE FROM organization WHERE id IN (${workspaceId}, ${soloId})`
    );
    await query(
      sql`DELETE FROM users WHERE id IN (${dueId}, ${graceId}, ${ownerId})`
    );
  });

  it("counts and lists the workspaces a user owns, with who else owns them", async () => {
    const { countOwnedWorkspaces, ownedWorkspaces } =
      await import("./workspace/ownership");
    expect(await countOwnedWorkspaces(ownerId)).toBe(2);
    const owned = await ownedWorkspaces(ownerId);
    expect(owned.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [
        { id: soloId, name: "Purge IT Solo", members: 1, owners: 1 },
        { id: workspaceId, name: "Purge IT WS", members: 2, owners: 2 },
      ].sort((a, b) => a.id.localeCompare(b.id))
    );
  });

  it("purges the account past its grace period and keeps the one inside it", async () => {
    const { purgeDeletedAccounts } = await import("./account-deletion");
    const purgedHere: string[] = [];

    const result = await purgeDeletedAccounts({
      beforePurge: async (userId) => {
        purgedHere.push(userId);
      },
    });

    expect(purgedHere).toContain(dueId);
    expect(purgedHere).not.toContain(graceId);
    expect(result.failed).not.toContain(dueId);

    const users = await query(
      sql`SELECT id FROM users WHERE id IN (${dueId}, ${graceId}) ORDER BY id`
    );
    expect(users).toEqual([{ id: graceId }]);

    expect(
      await query(
        sql`SELECT user_id FROM usage_records WHERE id = ${`usage-${suffix}`}`
      )
    ).toEqual([{ user_id: null }]);
    expect(
      await query(
        sql`SELECT id FROM conversations WHERE id = ${`conv-${suffix}`}`
      )
    ).toEqual([]);
    expect(
      await query(
        sql`SELECT user_id, actor_id, before_value, target_id FROM user_memory_audit
            WHERE id = ${`audit-${suffix}`}`
      )
    ).toEqual([
      { user_id: null, actor_id: null, before_value: null, target_id: "f-1" },
    ]);
  });
});
