/**
 * Against a real Postgres; runs only when DATABASE_URL is set. Core does not
 * depend on @intelligo-dev/auth, and the service has no fact-creation entry
 * point, so users, workspaces and facts are inserted with a raw `pg` client.
 *
 * Run:
 *   DATABASE_URL=postgres://intelligo:intelligo@localhost:5432/intelligo \
 *     pnpm vitest run packages/core/src/identity/service.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const d = DATABASE_URL ? describe : describe.skip;

d("identity service — real DB integration", () => {
  const client = new Client({ connectionString: DATABASE_URL });
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workspaceId = `identity-it-ws-${suffix}`;
  const userId = `identity-it-user-${suffix}`;
  const otherUserId = `identity-it-user-other-${suffix}`;

  let listFacts: typeof import("./service").listFacts;
  let deleteFact: typeof import("./service").deleteFact;
  let exportIdentity: typeof import("./service").exportIdentity;
  let getAuditTrail: typeof import("./service").getAuditTrail;
  let isIdentityServiceError: typeof import("./errors").isIdentityServiceError;

  const actor = { workspaceId, userId };
  const _otherActor = { workspaceId, userId: otherUserId };

  const factId = `fact-${suffix}-mine`;
  const otherFactId = `fact-${suffix}-other`;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    ({ listFacts, deleteFact, exportIdentity, getAuditTrail } =
      await import("./service"));
    ({ isIdentityServiceError } = await import("./errors"));

    await client.connect();
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at, updated_at)
       VALUES ($1, 'Identity IT WS', $2, now(), now())`,
      [workspaceId, `identity-it-${suffix}`]
    );
    for (const [id, email] of [
      [userId, `identity-it-${suffix}@example.test`],
      [otherUserId, `identity-it-other-${suffix}@example.test`],
    ]) {
      await client.query(
        `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
         VALUES ($1, 'Identity IT', $2, true, now(), now())`,
        [id, email]
      );
    }

    await client.query(
      `INSERT INTO user_facts
         (id, user_id, workspace_id, category, key, value, confidence, importance, created_at)
       VALUES ($1, $2, $3, 'skill', 'testing', $4, 0.9, 7, now())`,
      [factId, userId, workspaceId, JSON.stringify("writes integration tests")]
    );
    await client.query(
      `INSERT INTO user_facts
         (id, user_id, workspace_id, category, key, value, confidence, importance, created_at)
       VALUES ($1, $2, $3, 'skill', 'testing', $4, 0.9, 7, now())`,
      [
        otherFactId,
        otherUserId,
        workspaceId,
        JSON.stringify("someone else's fact"),
      ]
    );
  });

  // `user_memory_audit` is append-only: a BEFORE DELETE trigger raises on
  // every row, including the ones a cascade reaches. Its foreign keys to
  // `users` and `organization` are ON DELETE CASCADE, so deleting either
  // parent of an audited row raises too. The audit rows, the workspace and
  // the users therefore stay; the run's ids are unique, so a later run
  // never meets them. Facts carry no audit constraint and are removed.
  afterAll(async () => {
    await client.query(`DELETE FROM user_facts WHERE workspace_id = $1`, [
      workspaceId,
    ]);
    await client.end();
  });

  it("listFacts only returns the actor's own facts", async () => {
    const facts = await listFacts(actor);
    expect(facts.map((f) => f.id)).toContain(factId);
    expect(facts.map((f) => f.id)).not.toContain(otherFactId);
  });

  it("deleteFact throws not_found for another user's fact", async () => {
    await expect(deleteFact(actor, otherFactId)).rejects.toSatisfy(
      (err: unknown) => isIdentityServiceError(err) && err.code === "not_found"
    );
  });

  it("deleteFact throws not_found for a nonexistent fact", async () => {
    await expect(deleteFact(actor, "no-such-fact")).rejects.toSatisfy(
      (err: unknown) => isIdentityServiceError(err) && err.code === "not_found"
    );
  });

  it("deleteFact removes the fact and records a delete audit row", async () => {
    await deleteFact(actor, factId);

    const remaining = await listFacts(actor);
    expect(remaining.map((f) => f.id)).not.toContain(factId);

    const audit = await getAuditTrail(actor, { targetId: factId });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe("delete");
    expect(audit[0]?.targetKind).toBe("fact");
    expect(audit[0]?.actorId).toBe(userId);
  });

  it("exportIdentity aggregates the actor's data and records an export audit row", async () => {
    const result = await exportIdentity(actor);
    expect(result.user).toEqual({ id: userId, workspaceId });
    expect(Array.isArray(result.facts)).toBe(true);
    expect(Array.isArray(result.memories)).toBe(true);
    expect(Array.isArray(result.audit)).toBe(true);

    const exportRows = result.audit.filter((row) => row.action === "export");
    expect(exportRows.length).toBeGreaterThan(0);
  });

  it("getAuditTrail returns most-recent-first, scoped to the actor", async () => {
    const trail = await getAuditTrail(actor);
    expect(trail.length).toBeGreaterThan(0);
    expect(trail.every((row) => row.workspaceId === workspaceId)).toBe(true);
    for (let i = 1; i < trail.length; i++) {
      expect(trail[i - 1]!.createdAt.getTime()).toBeGreaterThanOrEqual(
        trail[i]!.createdAt.getTime()
      );
    }
  });
});
