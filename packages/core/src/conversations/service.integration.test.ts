/**
 * Conversations service integration tests — real Postgres.
 *
 * Runs only when DATABASE_URL is set (mirrors
 * packages/auth/src/workspace/service.integration.test.ts and
 * packages/core/src/db/__tests__/audit-trigger.int.test.ts). @intelligo/core
 * has no dependency on @intelligo/auth (see
 * tests/architecture/dependency-direction.test.ts), so fixtures are
 * inserted with a raw `pg` client rather than Better-Auth's sign-up API.
 *
 * Run:
 *   DATABASE_URL=postgres://intelligo:intelligo@localhost:5432/intelligo \
 *     pnpm vitest run packages/core/src/conversations/service.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const d = DATABASE_URL ? describe : describe.skip;

d("conversations service — real DB integration", () => {
  const client = new Client({ connectionString: DATABASE_URL });
  const suffix = Date.now();
  const workspaceId = `conv-it-ws-${suffix}`;
  const userId = `conv-it-user-${suffix}`;
  const otherUserId = `conv-it-user-other-${suffix}`;

  let service: typeof import("./service");
  let isConversationServiceError: typeof import("./errors").isConversationServiceError;

  const actor = { workspaceId, userId };
  const otherActor = { workspaceId, userId: otherUserId };

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    service = await import("./service");
    ({ isConversationServiceError } = await import("./errors"));

    await client.connect();
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at, updated_at)
       VALUES ($1, 'Conv IT WS', $2, now(), now())`,
      [workspaceId, `conv-it-${suffix}`]
    );
    for (const [id, email] of [
      [userId, `conv-it-${suffix}@example.test`],
      [otherUserId, `conv-it-other-${suffix}@example.test`],
    ]) {
      await client.query(
        `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
         VALUES ($1, 'Conv IT', $2, true, now(), now())`,
        [id, email]
      );
    }
  });

  afterAll(async () => {
    await client.query(`DELETE FROM conversations WHERE workspace_id = $1`, [
      workspaceId,
    ]);
    await client.query(`DELETE FROM organization WHERE id = $1`, [workspaceId]);
    await client.query(`DELETE FROM users WHERE id = ANY($1)`, [
      [userId, otherUserId],
    ]);
    await client.end();
  });

  it("createConversation then getConversation round-trips, scoped to the actor", async () => {
    const conv = await service.createConversation(actor, {
      agentId: "support-assistant",
      modelId: "google/gemini-2.5-flash",
    });
    expect(conv.workspaceId).toBe(workspaceId);
    expect(conv.userId).toBe(userId);

    const fetched = await service.getConversation(actor, conv.id);
    expect(fetched.id).toBe(conv.id);
  });

  it("getConversation throws not_found for another user's conversation", async () => {
    const conv = await service.createConversation(actor, {
      agentId: "support-assistant",
      modelId: "google/gemini-2.5-flash",
    });

    await expect(
      service.getConversation(otherActor, conv.id)
    ).rejects.toSatisfy(
      (err: unknown) =>
        isConversationServiceError(err) && err.code === "not_found"
    );
  });

  it("listConversations only returns the actor's own conversations", async () => {
    await service.createConversation(actor, {
      agentId: "support-assistant",
      modelId: "google/gemini-2.5-flash",
    });
    await service.createConversation(otherActor, {
      agentId: "support-assistant",
      modelId: "google/gemini-2.5-flash",
    });

    const list = await service.listConversations(actor, { limit: 100 });
    expect(list.length).toBeGreaterThan(0);

    const otherList = await service.listConversations(otherActor, {
      limit: 100,
    });
    const overlap = list.filter((c) => otherList.some((o) => o.id === c.id));
    expect(overlap).toHaveLength(0);
  });

  it("renameConversation updates the title within scope", async () => {
    const conv = await service.createConversation(actor, {
      agentId: "support-assistant",
      modelId: "google/gemini-2.5-flash",
    });

    const renamed = await service.renameConversation(
      actor,
      conv.id,
      "  New Title  "
    );
    expect(renamed.title).toBe("New Title");
  });

  it("renameConversation throws not_found for a conversation outside the actor's scope", async () => {
    const conv = await service.createConversation(otherActor, {
      agentId: "support-assistant",
      modelId: "google/gemini-2.5-flash",
    });

    await expect(
      service.renameConversation(actor, conv.id, "Hijack")
    ).rejects.toSatisfy(
      (err: unknown) =>
        isConversationServiceError(err) && err.code === "not_found"
    );
  });

  it("saveMessages, getMessages and upsertMessages round-trip in order", async () => {
    const conv = await service.createConversation(actor, {
      agentId: "support-assistant",
      modelId: "google/gemini-2.5-flash",
    });

    await service.saveMessages(actor, [
      {
        id: `msg-${suffix}-1`,
        conversationId: conv.id,
        role: "user",
        parts: JSON.stringify([{ type: "text", text: "hi" }]),
      },
    ]);

    await service.upsertMessages(conv.id, [
      {
        id: `msg-${suffix}-2`,
        role: "assistant",
        parts: [{ type: "text", text: "hello" }],
      },
    ]);

    const msgs = await service.getMessages(actor, conv.id);
    expect(msgs.map((m) => m.id)).toEqual([
      `msg-${suffix}-1`,
      `msg-${suffix}-2`,
    ]);

    // Re-upserting the same id updates in place rather than duplicating.
    await service.upsertMessages(conv.id, [
      {
        id: `msg-${suffix}-2`,
        role: "assistant",
        parts: [{ type: "text", text: "hello again" }],
      },
    ]);
    const afterUpsert = await service.getMessages(actor, conv.id);
    expect(afterUpsert).toHaveLength(2);
    expect(JSON.parse(afterUpsert[1]!.parts)).toEqual([
      { type: "text", text: "hello again" },
    ]);
  });

  it("saveMessages throws forbidden when a message targets a conversation the actor does not own", async () => {
    const conv = await service.createConversation(otherActor, {
      agentId: "support-assistant",
      modelId: "google/gemini-2.5-flash",
    });

    await expect(
      service.saveMessages(actor, [
        {
          id: `msg-${suffix}-hijack`,
          conversationId: conv.id,
          role: "user",
          parts: JSON.stringify([{ type: "text", text: "hijack" }]),
        },
      ])
    ).rejects.toSatisfy(
      (err: unknown) =>
        isConversationServiceError(err) && err.code === "forbidden"
    );
  });

  it("voteMessage and getVotes round-trip, then deleteTrailingMessages prunes", async () => {
    const conv = await service.createConversation(actor, {
      agentId: "support-assistant",
      modelId: "google/gemini-2.5-flash",
    });
    const inserted = await service.saveMessages(actor, [
      {
        id: `msg-${suffix}-a`,
        conversationId: conv.id,
        role: "user",
        parts: JSON.stringify([{ type: "text", text: "one" }]),
      },
      {
        id: `msg-${suffix}-b`,
        conversationId: conv.id,
        role: "assistant",
        parts: JSON.stringify([{ type: "text", text: "two" }]),
      },
    ]);
    expect(inserted).toHaveLength(2);

    await service.voteMessage(actor, {
      chatId: conv.id,
      messageId: `msg-${suffix}-a`,
      type: "up",
    });
    const votes = await service.getVotes(actor, conv.id);
    expect(votes).toHaveLength(1);
    expect(votes[0]?.isUpvoted).toBe(true);

    const { deletedCount } = await service.deleteTrailingMessages(actor, {
      id: `msg-${suffix}-a`,
    });
    expect(deletedCount).toBe(1);

    const remaining = await service.getMessages(actor, conv.id);
    expect(remaining.map((m) => m.id)).toEqual([`msg-${suffix}-a`]);
  });

  it("deleteConversation removes the conversation for the owning actor", async () => {
    const conv = await service.createConversation(actor, {
      agentId: "support-assistant",
      modelId: "google/gemini-2.5-flash",
    });

    await service.deleteConversation(actor, conv.id);

    await expect(service.getConversation(actor, conv.id)).rejects.toSatisfy(
      (err: unknown) =>
        isConversationServiceError(err) && err.code === "not_found"
    );
  });

  it("deleteAllConversations only removes the actor's own conversations", async () => {
    await service.createConversation(actor, {
      agentId: "support-assistant",
      modelId: "google/gemini-2.5-flash",
    });
    const untouched = await service.createConversation(otherActor, {
      agentId: "support-assistant",
      modelId: "google/gemini-2.5-flash",
    });

    const { deletedCount } = await service.deleteAllConversations(actor);
    expect(deletedCount).toBeGreaterThan(0);

    const stillThere = await service.getConversation(otherActor, untouched.id);
    expect(stillThere.id).toBe(untouched.id);
  });

  it("getConversationHistory paginates with a cursor scoped to the actor", async () => {
    for (let i = 0; i < 3; i++) {
      await service.createConversation(actor, {
        agentId: "support-assistant",
        modelId: "google/gemini-2.5-flash",
      });
    }

    const page1 = await service.getConversationHistory(actor, { limit: 2 });
    expect(page1.chats).toHaveLength(2);

    const cursor = page1.chats.at(-1)!.id;
    const page2 = await service.getConversationHistory(actor, {
      limit: 2,
      endingBefore: cursor,
    });
    expect(
      page2.chats.every((c) => !page1.chats.some((p) => p.id === c.id))
    ).toBe(true);
  });
});
