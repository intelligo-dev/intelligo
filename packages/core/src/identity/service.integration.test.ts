/**
 * Against a real Postgres; runs only when DATABASE_URL is set. Core does not
 * depend on @intelligo-dev/auth, so users and workspaces are inserted with
 * a raw `pg` client, and so are the first two facts, one per user.
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
  let saveProfileSnapshot: typeof import("./service").saveProfileSnapshot;
  let recordFact: typeof import("./service").recordFact;
  let confirmFact: typeof import("./service").confirmFact;
  let isIdentityServiceError: typeof import("./errors").isIdentityServiceError;

  const actor = { workspaceId, userId };

  const factId = `fact-${suffix}-mine`;
  const otherFactId = `fact-${suffix}-other`;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    ({
      listFacts,
      deleteFact,
      exportIdentity,
      getAuditTrail,
      saveProfileSnapshot,
      recordFact,
      confirmFact,
    } = await import("./service"));
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

  // `user_memory_audit` is append-only, so its rows stay; deleting the
  // workspace and the users clears their references, and the facts and
  // snapshots go with them.
  afterAll(async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [workspaceId]);
    await client.query(`DELETE FROM users WHERE id IN ($1, $2)`, [
      userId,
      otherUserId,
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
    expect(audit[0]?.beforeValue).toBeNull();
    expect(audit[0]?.afterValue).toBeNull();
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

  it("saveProfileSnapshot inserts version 1, then replaces and bumps it", async () => {
    const first = await saveProfileSnapshot(actor, {
      summary: "Profile: 1 skills.",
      summaryEn: "Profile: 1 skills.",
      factsDigest: { totalFacts: 1 },
      activeGoals: ["graduate"],
      synthesizedByModel: "deterministic",
      triggerReason: "manual",
    });
    expect(first.version).toBe(1);
    expect(first.workspaceId).toBe(workspaceId);
    expect(first.userId).toBe(userId);

    const second = await saveProfileSnapshot(actor, {
      summary: "Profile: 2 skills.",
      factsDigest: { totalFacts: 2 },
      summaryEn: null,
      triggerReason: "fact_threshold",
    });
    expect(second.version).toBe(2);
    expect(second.summary).toBe("Profile: 2 skills.");
    expect(second.factsDigest).toEqual({ totalFacts: 2 });
    // Undefined keeps, null clears.
    expect(second.activeGoals).toEqual(["graduate"]);
    expect(second.synthesizedByModel).toBe("deterministic");
    expect(second.summaryEn).toBeNull();

    const exported = await exportIdentity(actor);
    expect(exported.snapshot?.version).toBe(2);

    const trail = await getAuditTrail(actor, { targetId: userId });
    const writes = trail
      .filter((row) => row.targetKind === "snapshot" && row.action !== "export")
      .map((row) => [row.action, row.actorKind]);
    expect(writes).toEqual([
      ["update", "system_job"],
      ["create", "system_job"],
    ]);
  });

  it("saveProfileSnapshot keeps one row per user per workspace", async () => {
    const otherActor = { workspaceId, userId: otherUserId };
    const theirs = await saveProfileSnapshot(otherActor, {
      summary: "Someone else.",
      factsDigest: {},
    });
    expect(theirs.version).toBe(1);
    const mine = await exportIdentity(actor);
    expect(mine.snapshot?.summary).toBe("Profile: 2 skills.");
  });

  it("recordFact creates a fact, then replaces it, auditing both", async () => {
    const first = await recordFact(actor, {
      category: "goal",
      key: "it.role",
      value: { label: "Data analyst" },
      confidence: 0.6,
      extractionMethod: "llm_extraction",
      sourceProduct: "it",
    });
    expect(first.written).toBe(true);
    expect(first.fact.lastConfirmedAt).toBeNull();

    const second = await recordFact(actor, {
      category: "goal",
      key: "it.role",
      value: { label: "Data engineer" },
      confidence: 0.7,
      extractionMethod: "llm_extraction",
    });
    expect(second.fact.id).toBe(first.fact.id);
    expect(second.fact.value).toEqual({ label: "Data engineer" });
    expect(second.fact.sourceProduct).toBe("it");

    const trail = await getAuditTrail(actor, { targetId: first.fact.id });
    expect(trail.map((row) => [row.action, row.actorKind])).toEqual([
      ["update", "agent"],
      ["create", "agent"],
    ]);
    expect(trail[0]?.beforeValue).toMatchObject({
      value: { label: "Data analyst" },
    });
    expect(trail[0]?.afterValue).toMatchObject({
      value: { label: "Data engineer" },
    });
  });

  it("recordFact keeps what the person wrote over a no more confident extraction", async () => {
    const stated = await recordFact(actor, {
      category: "constraint",
      key: "it.city",
      value: "Ulaanbaatar",
      confidence: 1,
      extractionMethod: "explicit_user_input",
    });
    expect(stated.fact.lastConfirmedAt).not.toBeNull();

    const extracted = await recordFact(actor, {
      category: "constraint",
      key: "it.city",
      value: "Darkhan",
      confidence: 0.9,
      extractionMethod: "llm_extraction",
    });
    expect(extracted.written).toBe(false);
    expect(extracted.fact.value).toBe("Ulaanbaatar");

    const trail = await getAuditTrail(actor, { targetId: stated.fact.id });
    expect(trail.map((row) => [row.action, row.actorKind])).toEqual([
      ["create", "user"],
    ]);
    expect(trail[0]?.actorId).toBe(userId);
  });

  it("recordFact keeps one fact per user under the same key", async () => {
    const otherActor = { workspaceId, userId: otherUserId };
    const theirs = await recordFact(otherActor, {
      category: "goal",
      key: "it.role",
      value: "Someone else's goal",
      confidence: 0.5,
      extractionMethod: "inline_tool",
    });
    const mine = (await listFacts(actor)).find((f) => f.key === "it.role");
    expect(theirs.fact.id).not.toBe(mine?.id);
    expect(mine?.value).toEqual({ label: "Data engineer" });
  });

  it("confirmFact stamps the confirmation and audits it", async () => {
    const recorded = await recordFact(actor, {
      category: "skill",
      key: "it.sql",
      value: "SQL",
      confidence: 0.5,
      extractionMethod: "llm_extraction",
    });
    const confirmed = await confirmFact(actor, recorded.fact.id, {
      confidence: 0.95,
    });
    expect(confirmed.lastConfirmedAt).not.toBeNull();
    expect(confirmed.confidence).toBe(0.95);
    const [latest] = await getAuditTrail(actor, {
      targetId: recorded.fact.id,
    });
    expect(latest).toMatchObject({
      action: "update",
      actorKind: "user",
      actorId: userId,
    });
  });

  it("confirmFact refuses another user's fact", async () => {
    const theirs = (await listFacts({ workspaceId, userId: otherUserId })).find(
      (f) => f.key === "it.role"
    )!;
    await expect(confirmFact(actor, theirs.id)).rejects.toSatisfy(
      (err: unknown) => isIdentityServiceError(err) && err.code === "not_found"
    );
  });

  it("deleteFact attributes a removal to the actor it names", async () => {
    const recorded = await recordFact(actor, {
      category: "skill",
      key: "it.stale",
      value: "COBOL",
      confidence: 0.4,
      extractionMethod: "llm_extraction",
    });
    await deleteFact(actor, recorded.fact.id, {
      actorKind: "system_job",
      reason: "expired",
    });
    const [row] = await getAuditTrail(actor, { targetId: recorded.fact.id });
    expect(row).toMatchObject({
      action: "delete",
      actorKind: "system_job",
      actorId: null,
      reason: "expired",
    });
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
