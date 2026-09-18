/**
 * Feature Flags Schema
 *
 * Runtime overrides for feature gates: `@intelligo-dev/billing`'s
 * feature check reads a flag by name here before it falls back to the
 * plan's entitlements, so a feature can be switched off (or on) for a
 * deployment without a deploy.
 */

import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

/** Feature flags table — runtime feature toggles. */
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
