/**
 * Against a real Postgres; runs only when DATABASE_URL is set.
 *
 * Run:
 *   DATABASE_URL=postgres://intelligo:intelligo@localhost:5432/intelligo \
 *     pnpm vitest run packages/core/src/conversations/history.integration.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const d = DATABASE_URL ? describe : describe.skip;

d("conversation history reads — real DB integration", () => {
  const client = new Client({ connectionString: DATABASE_URL });
  const suffix = Date.now();
  const workspaceId = `hist-it-ws-${suffix}`;
  const userId = `hist-it-user-${suffix}`;
  const otherUserId = `hist-it-other-${suffix}`;
  const conversationId = `hist-it-conv-${suffix}`;
  const actor = { workspaceId, userId };
  const ids = Array.from({ length: 7 }, (_, i) => `hist-${suffix}-${i}`);

  let history: typeof import("./history");

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    history = await import("./history");

    await client.connect();
    await client.query(
      `INSERT INTO organization (id, name, slug) VALUES ($1, 'Hist', $1)`,
      [workspaceId]
    );
    for (const [id, email] of [
      [userId, `hist-${suffix}@example.test`],
      [otherUserId, `hist-other-${suffix}@example.test`],
    ]) {
      await client.query(
        `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
         VALUES ($1, 'Hist', $2, true, now(), now())`,
        [id, email]
      );
    }
    await client.query(
      `INSERT INTO conversations (id, workspace_id, user_id, agent_id)
       VALUES ($1, $2, $3, 'assistant')`,
      [conversationId, workspaceId, userId]
    );
    // created_at left to the database, with its microseconds, one apart.
    for (const [index, id] of ids.entries()) {
      await client.query(
        `INSERT INTO messages (id, conversation_id, role, parts, created_at)
         VALUES ($1, $2, $3, '[]', clock_timestamp() + make_interval(secs => $4))`,
        [id, conversationId, index % 2 ? "assistant" : "user", index]
      );
    }
  });

  afterAll(async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [workspaceId]);
    await client.query(`DELETE FROM users WHERE id = ANY($1)`, [
      [userId, otherUserId],
    ]);
    await client.end();
  });

  const idsOf = (rows: Array<{ id: string }>) => rows.map((row) => row.id);

  it("pages back from the latest message, oldest first", async () => {
    const latest = await history.getRecentMessages(actor, conversationId, {
      limit: 3,
    });
    expect(idsOf(latest.messages)).toEqual(ids.slice(4));
    expect(latest.hasEarlier).toBe(true);

    const before = await history.getRecentMessages(actor, conversationId, {
      limit: 3,
      before: ids[4]!,
    });
    expect(idsOf(before.messages)).toEqual(ids.slice(1, 4));
    expect(before.hasEarlier).toBe(true);

    const first = await history.getRecentMessages(actor, conversationId, {
      limit: 3,
      before: ids[1]!,
    });
    expect(idsOf(first.messages)).toEqual([ids[0]]);
    expect(first.hasEarlier).toBe(false);
  });

  it("reads one message, and some by id in conversation order", async () => {
    expect((await history.getMessage(actor, conversationId, ids[2]!))?.id).toBe(
      ids[2]
    );
    expect(await history.getMessage(actor, conversationId, "nope")).toBeNull();
    const some = await history.getMessagesByIds(actor, conversationId, [
      ids[5]!,
      "nope",
      ids[1]!,
    ]);
    expect(idsOf(some)).toEqual([ids[1], ids[5]]);
  });

  it("refuses another user's conversation", async () => {
    await expect(
      history.getRecentMessages(
        { workspaceId, userId: otherUserId },
        conversationId,
        { limit: 3 }
      )
    ).rejects.toThrow();
  });
});
