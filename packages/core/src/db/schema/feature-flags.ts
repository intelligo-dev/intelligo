/**
 * Feature Flags Schema
 *
 * v0.3: Runtime-toggleable feature flags.
 * TODO: In v0.3, hasFeature() will query this table for runtime flag overrides.
 * For v0.2, FEATURE_MATRIX constant in billing/features.ts is the sole source of truth.
 * This schema exists to prepare the DB for future runtime toggleability.
 */

import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * Feature flags table - Runtime feature toggles (v0.3)
 *
 * In v0.2, this table is created but NOT used for feature gating.
 * FEATURE_MATRIX constant in billing/features.ts is the sole source of truth.
 */
export const featureFlags = pgTable("feature_flags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  enabledPlans: text("enabled_plans").notNull(), // JSON array string: e.g., '["free","pro","enterprise"]'
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Export inferred types for TypeScript usage
export type FeatureFlag = typeof featureFlags.$inferSelect;
export type InsertFeatureFlag = typeof featureFlags.$inferInsert;
