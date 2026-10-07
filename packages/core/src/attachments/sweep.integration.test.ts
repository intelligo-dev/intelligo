/**
 * Against a real Postgres; runs only when DATABASE_URL is set.
 *
 * Run:
 *   DATABASE_URL=postgres://intelligo:intelligo@localhost:5432/intelligo \
 *     pnpm vitest run packages/core/src/attachments/sweep.integration.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const d = DATABASE_URL ? describe : describe.skip;

d("attachment sweep — real DB integration", () => {
  const client = new Client({ connectionString: DATABASE_URL });
  const suffix = Date.now();
  const workspaceId = `att-sweep-ws-${suffix}`;
  const userId = `att-sweep-user-${suffix}`;
  const key = (name: string) => `ws/${workspaceId}/att/${suffix}-${name}`;

  let sweep: typeof import("./sweep");
  let storage: ReturnType<typeof import("../storage").createMemoryStorage>;

  const insertAttachment = async (
    name: string,
    options: { ageHours: number; conversationId?: string }
  ) => {
    await client.query(
      `INSERT INTO attachments
         (id, workspace_id, user_id, conversation_id, storage_key, filename, media_type, size_bytes, created_at)
       VALUES ($1, $2, $3, $4, $5, 'f.png', 'image/png', 1, now() - make_interval(hours => $6))`,
      [
        `${suffix}-${name}`,
        workspaceId,
        userId,
        options.conversationId ?? null,
        key(name),
        options.ageHours,
      ]
    );
    await storage.put({
      key: key(name),
      body: new Uint8Array([1]),
      contentType: "image/png",
    });
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    sweep = await import("./sweep");
    storage = (await import("../storage")).createMemoryStorage();

    await client.connect();
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at, updated_at)
       VALUES ($1, 'Sweep WS', $1, now(), now())`,
      [workspaceId]
    );
    await client.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'Sweep', $2, true, now(), now())`,
      [userId, `att-sweep-${suffix}@example.test`]
    );
    await client.query(
      `INSERT INTO conversations (id, workspace_id, user_id, agent_id)
       VALUES ($1, $2, $3, 'assistant')`,
      [`conv-${suffix}`, workspaceId, userId]
    );
  });

  afterAll(async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [workspaceId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await client.query(
      `DELETE FROM storage_deletions WHERE storage_key LIKE $1`,
      [`ws/${workspaceId}/%`]
    );
    await client.end();
  });

  it("deletes old unclaimed uploads and their objects, and keeps the rest", async () => {
    await insertAttachment("old-orphan", { ageHours: 48 });
    await insertAttachment("new-orphan", { ageHours: 0 });
    await insertAttachment("claimed", {
      ageHours: 48,
      conversationId: `conv-${suffix}`,
    });

    const result = await sweep.sweepAttachments({
      storage,
      olderThan: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    expect(result.orphansDeleted).toBeGreaterThanOrEqual(1);
    expect(storage.objects.has(key("old-orphan"))).toBe(false);
    expect(storage.objects.has(key("new-orphan"))).toBe(true);
    expect(storage.objects.has(key("claimed"))).toBe(true);
  });

  it("deletes the objects of rows a workspace deletion cascaded away", async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [workspaceId]);
    const queued = await client.query(
      `SELECT storage_key FROM storage_deletions WHERE storage_key LIKE $1`,
      [`ws/${workspaceId}/%`]
    );
    expect(queued.rows.map((row) => row.storage_key).sort()).toEqual(
      [key("claimed"), key("new-orphan")].sort()
    );

    await sweep.sweepAttachments({ storage, olderThan: new Date(0) });

    expect(storage.objects.size).toBe(0);
    const left = await client.query(
      `SELECT 1 FROM storage_deletions WHERE storage_key LIKE $1`,
      [`ws/${workspaceId}/%`]
    );
    expect(left.rowCount).toBe(0);
  });

  it("keeps a key queued when storage fails to delete its object", async () => {
    await client.query(
      `INSERT INTO storage_deletions (storage_key) VALUES ($1)`,
      [key("stuck")]
    );
    const failing = {
      ...storage,
      delete: async () => {
        throw new Error("bucket unavailable");
      },
    };

    const result = await sweep.sweepAttachments({
      storage: failing,
      olderThan: new Date(0),
    });

    expect(result.objectsFailed).toBeGreaterThanOrEqual(1);
    const left = await client.query(
      `SELECT 1 FROM storage_deletions WHERE storage_key = $1`,
      [key("stuck")]
    );
    expect(left.rowCount).toBe(1);
  });

  it("moves a key storage keeps refusing behind the keys queued after it", async () => {
    // Queued before anything else, so they lead the queue.
    const refused = [key("refused-1"), key("refused-2")];
    await client.query(
      `INSERT INTO storage_deletions (storage_key, queued_at)
       SELECT k, '2000-01-01' FROM unnest($1::text[]) AS k`,
      [refused]
    );
    await client.query(
      `INSERT INTO storage_deletions (storage_key, queued_at)
       VALUES ($1, '2000-01-02')`,
      [key("deletable")]
    );
    const deleted: string[] = [];
    const partial = {
      ...storage,
      delete: async (storageKey: string) => {
        if (refused.includes(storageKey)) throw new Error("access denied");
        deleted.push(storageKey);
      },
    };
    // Earlier tests may leave their own keys at the head of the queue;
    // clear the ones this suite queued that are not part of this case.
    await client.query(
      `DELETE FROM storage_deletions WHERE storage_key LIKE $1 AND storage_key <> ALL($2)`,
      [`ws/${workspaceId}/%`, [...refused, key("deletable")]]
    );

    await sweep.sweepAttachments({
      storage: partial,
      olderThan: new Date(0),
      limit: 2,
    });
    await sweep.sweepAttachments({
      storage: partial,
      olderThan: new Date(0),
      limit: 2,
    });

    expect(deleted).toContain(key("deletable"));
    const left = await client.query(
      `SELECT storage_key FROM storage_deletions WHERE storage_key = ANY($1)`,
      [[...refused, key("deletable")]]
    );
    expect(left.rows.map((row) => row.storage_key).sort()).toEqual(
      [...refused].sort()
    );
  });
});
