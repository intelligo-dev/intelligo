/**
 * A plan granted as a product decision: the subscription row moves (or
 * is created), Stripe columns stay as they were, and an unknown slug is
 * refused instead of writing a dangling plan id. A grant with an end
 * lapses to the free plan when maintenance runs, and not before.
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

  // The column is a timestamp without time zone holding UTC, which the
  // raw client would read as local time: read it as epoch milliseconds.
  const period = async () => {
    const row = (
      await client.query<{ plan_id: string; end_ms: string | null }>(
        `SELECT plan_id, (extract(epoch FROM current_period_end) * 1000)::bigint AS end_ms
         FROM subscriptions WHERE workspace_id = $1`,
        [WORKSPACE]
      )
    ).rows[0];
    return row
      ? {
          plan_id: row.plan_id,
          current_period_end: row.end_ms === null ? null : Number(row.end_ms),
        }
      : undefined;
  };

  const DAY = 24 * 60 * 60 * 1000;

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
      endsAt: null,
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

  it("ends a grant given days that many days from now", async () => {
    const before = Date.now();
    const result = await grant.grantPlan({
      workspaceId: WORKSPACE,
      planSlug: "plan-grant-pro",
      reason: "one month",
      days: 30,
    });

    const end = (await period())!.current_period_end!;
    expect(end).toBeGreaterThanOrEqual(before + 30 * DAY - 1000);
    expect(end).toBeLessThanOrEqual(Date.now() + 30 * DAY + 1000);
    expect(result.endsAt?.getTime()).toBe(end);
  });

  it("adds a second grant of the same plan to the running one's end", async () => {
    await grant.grantPlan({
      workspaceId: WORKSPACE,
      planSlug: "plan-grant-pro",
      reason: "first month",
      days: 30,
    });
    const first = (await period())!.current_period_end!;

    await grant.grantPlan({
      workspaceId: WORKSPACE,
      planSlug: "plan-grant-pro",
      reason: "second month",
      days: 30,
    });

    const second = (await period())!.current_period_end!;
    expect(second - first).toBeGreaterThanOrEqual(30 * DAY - 1000);
    expect(second - first).toBeLessThanOrEqual(30 * DAY + 1000);
  });

  it("clears the end when the next grant has none", async () => {
    await grant.grantPlan({
      workspaceId: WORKSPACE,
      planSlug: "plan-grant-pro",
      reason: "trial month",
      days: 30,
    });
    await grant.grantPlan({
      workspaceId: WORKSPACE,
      planSlug: "plan-grant-pro",
      reason: "partner deal",
    });

    expect((await period())!.current_period_end).toBeNull();
  });

  it("leaves a Stripe-billed workspace's period to Stripe", async () => {
    const stripeEnd = new Date(Date.now() + 5 * DAY);
    await client.query(
      `INSERT INTO subscriptions (id, workspace_id, plan_id, status, stripe_subscription_id, current_period_end)
       VALUES ('sub_grant_test', $1, 'plan_plan-grant-free', 'active', 'sub_stripe_2', $2)`,
      [WORKSPACE, stripeEnd.toISOString()]
    );

    const result = await grant.grantPlan({
      workspaceId: WORKSPACE,
      planSlug: "plan-grant-pro",
      reason: "support",
      days: 30,
    });

    expect(result.endsAt).toBeNull();
    expect((await period())!.current_period_end!).toBe(stripeEnd.getTime());
  });

  it("refuses endsAt and days together", async () => {
    await expect(
      grant.grantPlan({
        workspaceId: WORKSPACE,
        planSlug: "plan-grant-pro",
        reason: "test",
        endsAt: new Date(),
        days: 1,
      })
    ).rejects.toMatchObject({ code: "invalid_plan" });
  });

  describe("processExpiredPlanGrants", () => {
    let freePlanId: string;

    beforeEach(async () => {
      await client.query(
        `INSERT INTO plans (id, name, slug, price_monthly, price_yearly, features, limits)
         VALUES ('plan_free', 'Free', 'free', 0, 0, '[]', '{}')
         ON CONFLICT (slug) DO NOTHING`
      );
      freePlanId = (
        await client.query<{ id: string }>(
          `SELECT id FROM plans WHERE slug = 'free'`
        )
      ).rows[0]!.id;
    });

    const audited = async () =>
      (
        await client.query<{ action: string }>(
          `SELECT action FROM audit_events WHERE workspace_id = $1 AND action = 'billing.plan_grant.expired'`,
          [WORKSPACE]
        )
      ).rows;

    it("returns a lapsed grant to the free plan and audits it", async () => {
      await grant.grantPlan({
        workspaceId: WORKSPACE,
        planSlug: "plan-grant-pro",
        reason: "lapsed",
        endsAt: new Date(Date.now() - 1000),
      });

      const result = await grant.processExpiredPlanGrants();

      expect(result.errors).toEqual([]);
      expect(await period()).toEqual({
        plan_id: freePlanId,
        current_period_end: null,
      });
      expect(await audited()).toHaveLength(1);
    });

    it("leaves a grant that has not lapsed, and one with no end", async () => {
      await grant.grantPlan({
        workspaceId: WORKSPACE,
        planSlug: "plan-grant-pro",
        reason: "running",
        days: 1,
      });
      await grant.processExpiredPlanGrants();
      expect((await period())!.plan_id).toBe("plan_plan-grant-pro");

      await grant.grantPlan({
        workspaceId: WORKSPACE,
        planSlug: "plan-grant-pro",
        reason: "forever",
      });
      await grant.processExpiredPlanGrants();
      expect((await period())!.plan_id).toBe("plan_plan-grant-pro");
      expect(await audited()).toEqual([]);
    });

    it("leaves a Stripe subscription past its period end to Stripe", async () => {
      await client.query(
        `INSERT INTO subscriptions (id, workspace_id, plan_id, status, stripe_subscription_id, current_period_end)
         VALUES ('sub_grant_test', $1, 'plan_plan-grant-pro', 'active', 'sub_stripe_3', $2)`,
        [WORKSPACE, new Date(Date.now() - DAY).toISOString()]
      );

      await grant.processExpiredPlanGrants();

      expect((await period())!.plan_id).toBe("plan_plan-grant-pro");
    });
  });
});
