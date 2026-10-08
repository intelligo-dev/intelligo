/**
 * Feature quotas against a real database: requests consuming one action
 * at once never take its counter past the plan's limit, and the first
 * load for a new user creates its row once however many checks run
 * together.
 *
 * Runs against a real database when TEST_PG_URL is set. DATABASE_URL
 * must point at the same database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

const suffix = Date.now();
const WORKSPACE = `ws_feature_quota_${suffix}`;
const USER = `user_feature_quota_${suffix}`;

d("feature quotas (integration)", () => {
  const client = new Client({ connectionString: PG_URL });
  let quota: typeof import("../feature-quota");

  const used = async () =>
    (
      await client.query<{ used: number | null }>(
        `SELECT (usage->>'export')::int AS used FROM user_quotas
          WHERE user_id = $1 AND workspace_id = $2`,
        [USER, WORKSPACE]
      )
    ).rows.map((row) => row.used);

  beforeAll(async () => {
    await client.connect();
    const registry = await import("../plan-registry");
    registry.setDefaultProductSlug("feature-quota-it");
    registry.registerProductPlans("feature-quota-it", {
      free: {
        name: "Free",
        slug: "free",
        description: "",
        priceOneTime: 0,
        targetAudience: "",
        aiModelLabel: "",
        limits: { export: 10, summary: 3 },
        features: [],
      },
    } as unknown as Parameters<typeof registry.registerProductPlans>[1]);
    quota = await import("../feature-quota");
  });

  beforeEach(async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [WORKSPACE]);
    await client.query(`DELETE FROM users WHERE id = $1`, [USER]);
    await client.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'Quota', $2, true, now(), now())`,
      [USER, `${USER}@example.test`]
    );
    await client.query(
      `INSERT INTO organization (id, name, slug) VALUES ($1, 'Quota', $1)`,
      [WORKSPACE]
    );
  });

  afterAll(async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [WORKSPACE]);
    await client.query(`DELETE FROM users WHERE id = $1`, [USER]);
    await client.end();
  });

  it("creates the row once when a new user's checks run together", async () => {
    const stats = await quota.getUserQuotaStats(USER, WORKSPACE, "free", [
      "export",
      "summary",
    ]);
    expect(stats.export?.allowed).toBe(true);
    expect(stats.summary?.allowed).toBe(true);
    expect(await used()).toEqual([null]);
  });

  it("records a use counted after a check", async () => {
    await quota.checkFeatureQuota(USER, WORKSPACE, "free", "export");
    await quota.recordFeatureUsage(USER, WORKSPACE, "export");
    await quota.recordFeatureUsage(USER, WORKSPACE, "export");
    expect(await used()).toEqual([2]);
  });

  it("admits only what is left of the limit when uses arrive at once", async () => {
    await quota.consumeFeatureQuota(USER, WORKSPACE, "free", "export");
    await client.query(
      `UPDATE user_quotas SET usage = '{"export": 9}' WHERE user_id = $1`,
      [USER]
    );

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        quota.consumeFeatureQuota(USER, WORKSPACE, "free", "export")
      )
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(1);
    expect(results.find((r) => r.allowed)).toMatchObject({
      used: 10,
      remaining: 0,
    });
    expect(results.filter((r) => !r.allowed)[0]).toMatchObject({
      used: 10,
      remaining: 0,
    });
    expect(await used()).toEqual([10]);
  });
});
