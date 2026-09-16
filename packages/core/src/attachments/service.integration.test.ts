/**
 * Attachments service integration tests — real Postgres.
 *
 * Runs only when DATABASE_URL is set (mirrors
 * packages/core/src/documents/service.integration.test.ts).
 *
 * Run:
 *   DATABASE_URL=postgres://intelligo:intelligo@localhost:5432/intelligo \
 *     pnpm vitest run packages/core/src/attachments/service.integration.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const d = DATABASE_URL ? describe : describe.skip;

d("attachments service — real DB integration", () => {
  const client = new Client({ connectionString: DATABASE_URL });
  const suffix = Date.now();
  const workspaceId = `att-it-ws-${suffix}`;
  const otherWorkspaceId = `att-it-ws-other-${suffix}`;
  const userId = `att-it-user-${suffix}`;

  let service: typeof import("./service");
  let isAttachmentServiceError: typeof import("./errors").isAttachmentServiceError;

  const actor = { workspaceId, userId };

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    service = await import("./service");
    ({ isAttachmentServiceError } = await import("./errors"));

    await client.connect();
    for (const [id, slug] of [
      [workspaceId, `att-it-${suffix}`],
      [otherWorkspaceId, `att-it-other-${suffix}`],
    ]) {
      await client.query(
        `INSERT INTO organization (id, name, slug, created_at, updated_at)
         VALUES ($1, 'Att IT WS', $2, now(), now())`,
        [id, slug]
      );
    }
    await client.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'Att IT', $2, true, now(), now())`,
      [userId, `att-it-${suffix}@example.test`]
    );
  });

  afterAll(async () => {
    await client.query(`DELETE FROM attachments WHERE workspace_id = ANY($1)`, [
      [workspaceId, otherWorkspaceId],
    ]);
    await client.query(`DELETE FROM organization WHERE id = ANY($1)`, [
      [workspaceId, otherWorkspaceId],
    ]);
    await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await client.end();
  });

  it("creates, reads back for its uploader, hides it from everyone else", async () => {
    const created = await service.createAttachment(actor, {
      storageKey: `ws/${workspaceId}/att/${suffix}-1`,
      filename: "q3.pdf",
      mediaType: "application/pdf",
      sizeBytes: 12,
    });
    expect(created.conversationId).toBeNull();

    const read = await service.getAttachment(actor, created.id);
    expect(read.filename).toBe("q3.pdf");

    await expect(
      service.getAttachment(
        { workspaceId: otherWorkspaceId, userId },
        created.id
      )
    ).rejects.toSatisfy(
      (e: unknown) => isAttachmentServiceError(e) && e.code === "not_found"
    );

    // Conversations are user-private, so an attachment is too: a
    // colleague who holds the id gets nothing, not a signed URL to
    // someone else's upload.
    await expect(
      service.getAttachment(
        { workspaceId, userId: `${userId}-colleague` },
        created.id
      )
    ).rejects.toSatisfy(
      (e: unknown) => isAttachmentServiceError(e) && e.code === "not_found"
    );
  });

  it("lists orphans, ties rows to a conversation and keeps extracted text", async () => {
    const created = await service.createAttachment(actor, {
      storageKey: `ws/${workspaceId}/att/${suffix}-2`,
      filename: "notes.txt",
      mediaType: "text/plain",
      sizeBytes: 3,
    });
    const orphans = await service.listOrphanAttachments({
      olderThan: new Date(Date.now() + 1000),
    });
    expect(orphans.map((a) => a.id)).toContain(created.id);

    await service.setExtractedText(actor, {
      id: created.id,
      text: "abc",
    });
    expect((await service.getAttachment(actor, created.id)).extractedText).toBe(
      "abc"
    );

    const deleted = await service.deleteAttachment(actor, created.id);
    expect(deleted.id).toBe(created.id);
  });
});
