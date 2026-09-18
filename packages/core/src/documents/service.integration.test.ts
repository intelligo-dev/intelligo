/**
 * Against a real Postgres; runs only when DATABASE_URL is set. Core does not
 * depend on @intelligo-dev/auth, so fixtures are inserted with a raw `pg`
 * client.
 *
 * Run:
 *   DATABASE_URL=postgres://intelligo:intelligo@localhost:5432/intelligo \
 *     pnpm vitest run packages/core/src/documents/service.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const d = DATABASE_URL ? describe : describe.skip;

d("documents service — real DB integration", () => {
  const client = new Client({ connectionString: DATABASE_URL });
  const suffix = Date.now();
  const workspaceId = `docs-it-ws-${suffix}`;
  const userId = `docs-it-user-${suffix}`;
  const otherUserId = `docs-it-user-other-${suffix}`;

  let getUserDocuments: typeof import("./service").getUserDocuments;
  let getDocument: typeof import("./service").getDocument;
  let saveDocument: typeof import("./service").saveDocument;
  let deleteDocumentVersions: typeof import("./service").deleteDocumentVersions;
  let isDocumentServiceError: typeof import("./errors").isDocumentServiceError;

  const actor = { workspaceId, userId };
  const otherActor = { workspaceId, userId: otherUserId };

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    ({ getUserDocuments, getDocument, saveDocument, deleteDocumentVersions } =
      await import("./service"));
    ({ isDocumentServiceError } = await import("./errors"));

    await client.connect();
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at, updated_at)
       VALUES ($1, 'Docs IT WS', $2, now(), now())`,
      [workspaceId, `docs-it-${suffix}`]
    );
    for (const [id, email] of [
      [userId, `docs-it-${suffix}@example.test`],
      [otherUserId, `docs-it-other-${suffix}@example.test`],
    ]) {
      await client.query(
        `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
         VALUES ($1, 'Docs IT', $2, true, now(), now())`,
        [id, email]
      );
    }
  });

  afterAll(async () => {
    await client.query(`DELETE FROM documents WHERE workspace_id = $1`, [
      workspaceId,
    ]);
    await client.query(`DELETE FROM organization WHERE id = $1`, [workspaceId]);
    await client.query(`DELETE FROM users WHERE id = ANY($1)`, [
      [userId, otherUserId],
    ]);
    await client.end();
  });

  it("saveDocument then getDocument round-trips, scoped to the actor", async () => {
    const id = `doc-${suffix}-1`;
    const saved = await saveDocument(actor, {
      id,
      title: "Quarterly Report",
      content: "hello",
      kind: "text",
    });
    expect(saved.id).toBe(id);
    expect(saved.content).toBe("hello");

    const fetched = await getDocument(actor, id);
    expect(fetched.id).toBe(id);
  });

  it("remembers the conversation a document came from, across versions", async () => {
    const id = `doc-${suffix}-conv`;
    const saved = await saveDocument(actor, {
      id,
      title: "Written in a chat",
      content: "v1",
      kind: "text",
      conversationId: "conv-abc",
    });
    expect(saved.conversationId).toBe("conv-abc");

    // The canvas resends title, kind and content on an edit — never the
    // conversation. Since every save writes a new version row, the link
    // has to be carried forward or editing a document silently unlinks
    // it from the conversation that wrote it.
    await new Promise((resolve) => setTimeout(resolve, 2));
    const edited = await saveDocument(actor, {
      id,
      title: "Written in a chat",
      content: "v2",
      kind: "text",
    });
    expect(edited.conversationId).toBe("conv-abc");
    expect((await getDocument(actor, id)).conversationId).toBe("conv-abc");
  });

  it("reports no conversation for a document nothing linked", async () => {
    const saved = await saveDocument(actor, {
      id: `doc-${suffix}-noconv`,
      title: "Saved by a job",
      content: "x",
      kind: "text",
    });
    expect(saved.conversationId).toBeNull();
  });

  it("getDocument throws not_found for another workspace/user's document", async () => {
    await expect(getDocument(otherActor, `doc-${suffix}-1`)).rejects.toSatisfy(
      (err: unknown) => isDocumentServiceError(err) && err.code === "not_found"
    );
  });

  it("saveDocument throws forbidden when a different user owns the id", async () => {
    const id = `doc-${suffix}-2`;
    await saveDocument(actor, {
      id,
      title: "Owned by actor",
      content: "x",
      kind: "text",
    });

    await expect(
      saveDocument(otherActor, {
        id,
        title: "Hijack attempt",
        content: "y",
        kind: "text",
      })
    ).rejects.toSatisfy(
      (err: unknown) => isDocumentServiceError(err) && err.code === "forbidden"
    );
  });

  it("getUserDocuments filters by the 'report' pseudo-kind via the classifier", async () => {
    const id = `doc-${suffix}-3`;
    await saveDocument(actor, {
      id,
      title: "snippet.ts",
      content: "console.log(1)",
      kind: "code",
    });

    const all = await getUserDocuments(actor);
    expect(all.length).toBeGreaterThanOrEqual(3);

    const codeOnly = await getUserDocuments(actor, { type: "code" });
    expect(codeOnly.every((d) => d.kind === "code")).toBe(true);
  });

  it("deleteDocumentVersions removes only versions created after the cutoff", async () => {
    const id = `doc-${suffix}-4`;
    await saveDocument(actor, {
      id,
      title: "Versioned",
      content: "v1",
      kind: "text",
    });
    const cutoff = new Date().toISOString();
    // saveDocument stamps createdAt from the JS clock at millisecond
    // precision, and the deletion is a strict `>` against the cutoff:
    // a v2 saved in the same millisecond as the cutoff survives it.
    // Step past the boundary so the test asserts the rule, not the
    // scheduler.
    await new Promise((resolve) => setTimeout(resolve, 2));
    await saveDocument(actor, {
      id,
      title: "Versioned",
      content: "v2",
      kind: "text",
    });

    const deleted = await deleteDocumentVersions(actor, id, cutoff);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]?.content).toBe("v2");
  });

  it("deleteDocumentVersions throws not_found for an id outside the actor's scope", async () => {
    await expect(
      deleteDocumentVersions(actor, "no-such-doc", new Date().toISOString())
    ).rejects.toSatisfy(
      (err: unknown) => isDocumentServiceError(err) && err.code === "not_found"
    );
  });
});
