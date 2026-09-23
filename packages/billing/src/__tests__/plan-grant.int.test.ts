/**
 * A plan granted as a product decision: the subscription row moves (or
 * is created), Stripe columns stay as they were, and an unknown slug is
 * refused instead of writing a dangling plan id.
 *
 * Runs against a real database when TEST_PG_URL is set. DATABASE_URL
 * must point at the same database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

const WORKSPACE = "ws_plan_grant_test";
const PLANS = ["plan-grant-free", "plan-grant-pro"];

d("grantPlan (integration)", () => {
  const client = new Client({ connectionString: PG_URL });
  let grant: typeof import("../plan-grant");

  const subscription = async () =>
    (
      await client.query<{
        plan_id: string;
        status: string;
        stripe_subscription_id: string | null;
      }>(
        `SELECT plan_id, status, stripe_subscription_id FROM subscriptions WHERE workspace_id = $1`,
        [WORKSPACE]
      )
    ).rows;

  beforeAll(async () => {
    await client.connect();
    grant = await import("../plan-grant");
  });

  beforeEach(async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [WORKSPACE]);
    await client.query(`DELETE FROM plans WHERE slug = ANY($1)`, [PLANS]);
    await client.query(
      `INSERT INTO organization (id, name, slug) VALUES ($1, 'Grant test', $1)`,
      [WORKSPACE]
    );
    for (const slug of PLANS) {
      await client.query(
        `INSERT INTO plans (id, name, slug, price_monthly, price_yearly, features, limits)
         VALUES ($1, $2, $2, 0, 0, '[]', '{}')`,
        [`plan_${slug}`, slug]
      );
    }
  });

  afterAll(async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [WORKSPACE]);
    await client.query(`DELETE FROM plans WHERE slug = ANY($1)`, [PLANS]);
    await client.end();
  });

  it("creates the subscription of a workspace that has none", async () => {
    const result = await grant.grantPlan({
      workspaceId: WORKSPACE,
      planSlug: "plan-grant-pro",
      reason: "test",
    });
    expect(result).toEqual({
      planId: "plan_plan-grant-pro",
      previousPlanId: null,
    });
    expect(await subscription()).toEqual([
      {
        plan_id: "plan_plan-grant-pro",
        status: "active",
        stripe_subscription_id: null,
      },
    ]);
  });

  it("moves an existing subscription and leaves its Stripe state alone", async () => {
    await client.query(
      `INSERT INTO subscriptions (id, workspace_id, plan_id, status, stripe_subscription_id)
       VALUES ('sub_grant_test', $1, 'plan_plan-grant-free', 'past_due', 'sub_stripe_1')`,
      [WORKSPACE]
    );
    const result = await grant.grantPlan({
      workspaceId: WORKSPACE,
      planSlug: "plan-grant-pro",
      reason: "referral reward",
      actorId: null,
    });
    expect(result.previousPlanId).toBe("plan_plan-grant-free");
    expect(await subscription()).toEqual([
      {
        plan_id: "plan_plan-grant-pro",
        status: "active",
        stripe_subscription_id: "sub_stripe_1",
      },
    ]);
  });

  it("refuses a slug with no plan row", async () => {
    await expect(
      grant.grantPlan({
        workspaceId: WORKSPACE,
        planSlug: "nope",
        reason: "test",
      })
    ).rejects.toMatchObject({ code: "invalid_plan" });
    expect(await subscription()).toEqual([]);
  });
});
