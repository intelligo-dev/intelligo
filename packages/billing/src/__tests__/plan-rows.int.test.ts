/**
 * The plans table is written from the registered catalogue.
 *
 * A fresh database has no plan rows — migrations describe structure
 * only — and `subscriptions.plan_id` references them, so the first
 * checkout depends on `ensurePlanRows` having run.
 *
 * Runs against a real database when TEST_PG_URL is set.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

import { fromMajor } from "@intelligo-dev/core/money";

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

const PRODUCT = "plan-rows-test";
const SLUGS = ["plan-rows-free", "plan-rows-pro"];

const plan = (slug: string, name: string, priceMonthly: number) => ({
  name,
  slug,
  description: `${name} plan`,
  priceOneTime: priceMonthly,
  priceMonthly,
  priceYearly: priceMonthly * 10,
  targetAudience: "Teams",
  aiModelLabel: "Standard",
  monthlyAllowance: fromMajor(1, "USD"),
  limits: { summaries: 5 },
  features: ["One", "Two"],
});

d("ensurePlanRows (integration)", () => {
  const client = new Client({ connectionString: PG_URL });
  let rows: typeof import("../plan-rows");
  let registry: typeof import("../plan-registry");

  const stored = async () =>
    (
      await client.query<{
        id: string;
        slug: string;
        name: string;
        price_monthly: number;
        stripe_price_id_monthly: string | null;
        limits: string;
        sort_order: number;
      }>(
        `SELECT id, slug, name, price_monthly, stripe_price_id_monthly, limits, sort_order
           FROM plans WHERE slug = ANY($1) ORDER BY sort_order`,
        [SLUGS]
      )
    ).rows;

  beforeAll(async () => {
    await client.connect();
    rows = await import("../plan-rows");
    registry = await import("../plan-registry");
  });

  beforeEach(async () => {
    await client.query(`DELETE FROM plans WHERE slug = ANY($1)`, [SLUGS]);
    registry.clearProductPlans();
  });

  afterAll(async () => {
    await client.query(`DELETE FROM plans WHERE slug = ANY($1)`, [SLUGS]);
    registry.clearProductPlans();
    await client.end();
  });

  it("writes one row per registered plan, keyed plan_<slug>", async () => {
    registry.registerProductPlans(PRODUCT, {
      free: plan(SLUGS[0]!, "Free", 0),
      pro: plan(SLUGS[1]!, "Pro", 20),
    });

    await rows.ensurePlanRows(PRODUCT);

    expect(await stored()).toEqual([
      expect.objectContaining({
        id: "plan_plan-rows-free",
        name: "Free",
        price_monthly: 0,
        sort_order: 0,
      }),
      expect.objectContaining({
        id: "plan_plan-rows-pro",
        name: "Pro",
        price_monthly: 20,
        limits: JSON.stringify({ summaries: 5 }),
        sort_order: 1,
      }),
    ]);
  });

  it("brings an existing row up to the catalogue on the next boot", async () => {
    registry.registerProductPlans(PRODUCT, { pro: plan(SLUGS[1]!, "Pro", 20) });
    await rows.ensurePlanRows(PRODUCT);

    registry.registerProductPlans(PRODUCT, {
      pro: {
        ...plan(SLUGS[1]!, "Professional", 25),
        stripePriceIdMonthly: "price_monthly_123",
      },
    });
    await rows.ensurePlanRows(PRODUCT);

    expect(await stored()).toEqual([
      expect.objectContaining({
        id: "plan_plan-rows-pro",
        name: "Professional",
        price_monthly: 25,
        stripe_price_id_monthly: "price_monthly_123",
      }),
    ]);
  });

  it("refuses a product with no registered plans", async () => {
    await expect(rows.ensurePlanRows(PRODUCT)).rejects.toThrow(
      /no plans registered for "plan-rows-test"/
    );
  });
});
