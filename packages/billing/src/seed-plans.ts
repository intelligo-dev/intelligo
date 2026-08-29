/**
 * Plan & Feature Flag Seeder
 *
 * Writes the registered product's plan catalogue into the `plans`
 * table and the product's registered feature matrix into feature_flags. Idempotent via
 * onConflictDoUpdate / onConflictDoNothing.
 *
 * The catalogue comes from the plan registry, so the vertical owns its
 * own prices and copy (ADR-0006) and this seeder stays generic.
 */

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { plans, featureFlags } from "@intelligo/core/db/schema";
import { getPlanConfigs, type PlanConfig } from "./plans.js";
import { getDefaultProductSlug, getProductFeatures } from "./plan-registry.js";

/**
 * Seed plans table with configured pricing plans
 * @param db - Drizzle database instance
 */
export async function seedPlans(
  db: NodePgDatabase<any>,
  productSlug: string = getDefaultProductSlug()
) {
  console.log("Seeding plans...");

  const configs = getPlanConfigs(productSlug);
  if (Object.keys(configs).length === 0) {
    throw new Error(
      `No plans registered for product "${productSlug}". Import the ` +
        `product's config (which calls registerProductPlans) before seeding.`
    );
  }

  const planEntries = [
    { key: "free" as const, id: "plan_free", sortOrder: 0 },
    { key: "standard" as const, id: "plan_standard", sortOrder: 1 },
    { key: "pro" as const, id: "plan_pro", sortOrder: 2 },
  ];

  for (const { key, id, sortOrder } of planEntries) {
    const config = configs[key] as PlanConfig | undefined;
    if (!config) continue;

    await db
      .insert(plans)
      .values({
        id,
        name: config.name,
        slug: config.slug,
        description: config.description,
        priceMonthly: config.priceOneTime, // One-time payment stored in priceMonthly column
        priceYearly: config.priceOneTime,
        features: JSON.stringify(config.featuresMn),
        limits: JSON.stringify(config.limits),
        isActive: true,
        sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: plans.slug,
        set: {
          name: config.name,
          description: config.description,
          priceMonthly: config.priceOneTime,
          priceYearly: config.priceOneTime,
          features: JSON.stringify(config.featuresMn),
          limits: JSON.stringify(config.limits),
          isActive: true,
          sortOrder,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`Seeded ${planEntries.length} plans (free, standard, pro)`);
}

/**
 * Seed feature_flags from the registered feature matrix
 *
 * Populates feature_flags from the product's registered matrix.
 * Idempotent: uses onConflictDoUpdate to safely re-run (updates enabledPlans if changed).
 *
 * @param db - Drizzle database instance
 */
export async function seedFeatureFlags(
  db: NodePgDatabase<any>,
  productSlug: string = getDefaultProductSlug()
) {
  console.log("Seeding feature flags...");

  const entries = Object.entries(getProductFeatures(productSlug) ?? {});
  let count = 0;

  for (const [featureName, planArray] of entries) {
    const description = featureName
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    await db
      .insert(featureFlags)
      .values({
        id: `flag_${featureName}`,
        name: featureName,
        description,
        enabledPlans: JSON.stringify(planArray),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: featureFlags.name,
        set: {
          enabledPlans: JSON.stringify(planArray),
          updatedAt: new Date(),
        },
      });

    count++;
  }

  console.log(`Seeded ${count} feature flags`);
}
