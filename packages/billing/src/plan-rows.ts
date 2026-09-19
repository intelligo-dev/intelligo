/**
 * The `plans` table follows the registered catalogue.
 *
 * A subscription row references its plan by id (`plan_<slug>`), and the
 * plan's name, prices and limits are read back through that join. The
 * catalogue itself is code a deployment owns (`lib/plans.ts`), so the
 * rows are written from it rather than seeded by a migration.
 */

import { db } from "@intelligo-dev/core/db";
import { plans } from "@intelligo-dev/core/db/schema";
import { sql } from "drizzle-orm";

import { getDefaultProductSlug, getProductPlans } from "./plan-registry";

/** The id a plan's row carries; checkout writes the same one. */
export function planRowId(planSlug: string): string {
  return `plan_${planSlug}`;
}

/**
 * Write one row per registered plan, from the composition root after
 * `registerProductPlans`. Idempotent: an existing row is brought up to
 * the catalogue, because the catalogue is the source and the row its
 * copy. A row whose plan left the catalogue is kept — subscriptions may
 * still reference it.
 *
 * @throws when the product has no registered plans, which would
 * otherwise leave checkout failing on the foreign key much later.
 */
export async function ensurePlanRows(productSlug?: string): Promise<void> {
  const slug = productSlug ?? getDefaultProductSlug();
  const catalogue = getProductPlans(slug);
  if (!catalogue || Object.keys(catalogue).length === 0) {
    throw new Error(
      `ensurePlanRows: no plans registered for "${slug}". Call registerProductPlans("${slug}", PLANS) first.`
    );
  }

  const rows = Object.values(catalogue).map((plan, index) => ({
    id: planRowId(plan.slug),
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    priceMonthly: Math.round(plan.priceMonthly ?? plan.priceOneTime),
    priceYearly: Math.round(plan.priceYearly ?? 0),
    stripePriceIdMonthly: plan.stripePriceIdMonthly ?? null,
    stripePriceIdYearly: plan.stripePriceIdYearly ?? null,
    features: JSON.stringify(plan.features),
    limits: JSON.stringify(plan.limits),
    sortOrder: index,
  }));

  await db
    .insert(plans)
    .values(rows)
    .onConflictDoUpdate({
      target: plans.id,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        priceMonthly: sql`excluded.price_monthly`,
        priceYearly: sql`excluded.price_yearly`,
        stripePriceIdMonthly: sql`excluded.stripe_price_id_monthly`,
        stripePriceIdYearly: sql`excluded.stripe_price_id_yearly`,
        features: sql`excluded.features`,
        limits: sql`excluded.limits`,
        sortOrder: sql`excluded.sort_order`,
        updatedAt: new Date(),
      },
    });
}
