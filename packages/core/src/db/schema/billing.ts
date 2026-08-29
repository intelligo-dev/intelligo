/**
 * Billing Database Schema
 *
 * Tables for managing subscriptions, plans, credits, and finance events.
 * Used by Stripe integration for subscription and credit-based billing.
 *
 * Pattern: snake_case columns in PostgreSQL, camelCase TypeScript API (via Drizzle mapping)
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

/**
 * Plans table - DB-configured pricing plans per product
 * Allows dynamic plan changes without code deployment
 */
export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  priceMonthly: integer("price_monthly").notNull(), // cents, 0 for free
  priceYearly: integer("price_yearly").notNull(), // cents
  stripePriceIdMonthly: text("stripe_price_id_monthly"),
  stripePriceIdYearly: text("stripe_price_id_yearly"),
  features: text("features").notNull(), // JSON string array
  limits: text("limits").notNull(), // JSON string: { tokens, conversations, teamMembers, workspaces, documents }
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Subscriptions table - Workspace subscription state
 * Each workspace has one active subscription (unique constraint)
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    status: text("status").notNull().default("active"), // active|past_due|canceled|trialing|incomplete
    billingMode: text("billing_mode").notNull().default("subscription"), // subscription|credit
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("subscriptions_workspace_id_idx").on(table.workspaceId),
    unique("subscriptions_workspace_id_unique").on(table.workspaceId),
  ]
);

/**
 * Credit balances table - Credit mode balance tracking
 * Each workspace has one credit balance record (unique constraint on workspaceId)
 */
export const creditBalances = pgTable("credit_balances", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0), // legacy USD-cents column
  totalPurchased: integer("total_purchased").notNull().default(0),
  totalUsed: integer("total_used").notNull().default(0),
  /** Authoritative MNT credit balance (top-ups + carry-over) */
  balanceMnt: integer("balance_mnt").notNull().default(0),
  totalPurchasedMnt: integer("total_purchased_mnt").notNull().default(0),
  totalUsedMnt: integer("total_used_mnt").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Billing Settings — singleton table holding the live FX rate and
 * margin multiplier. Read once per request (cached 60s in-process) so
 * model price changes and FX moves can be deployed without a code push.
 *
 * Convention: exactly one row with id = "default".
 */
export const billingSettings = pgTable("billing_settings", {
  id: text("id").primaryKey(),
  /** USD → MNT conversion rate, e.g., 3450 */
  usdToMntRate: integer("usd_to_mnt_rate").notNull().default(3450),
  /** Markup applied to raw model cost (×100, store as integer for precision) */
  marginMultiplierBp: integer("margin_multiplier_bp").notNull().default(400), // 400 = 4.00x
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Credit purchases table - One-time credit purchases
 * Tracks all credit purchase transactions
 */
export const creditPurchases = pgTable(
  "credit_purchases",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(), // cents paid
    credits: integer("credits").notNull(), // credits received
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    status: text("status").notNull().default("pending"), // pending|completed|failed
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("credit_purchases_workspace_id_idx").on(table.workspaceId)]
);

/**
 * Finance events table - Audit trail for all Stripe events
 * Ensures idempotent webhook processing and financial audit trail
 */
export const financeEvents = pgTable("finance_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").references(() => organization.id, {
    onDelete: "set null",
  }),
  stripeEventId: text("stripe_event_id").notNull().unique(),
  type: text("type").notNull(), // e.g., "checkout.session.completed", "invoice.paid"
  amount: integer("amount"), // cents
  currency: text("currency").default("usd"),
  metadata: text("metadata"), // JSON string
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Credit reservations table — closes the checkQuota → recordTokenUsage
 * TOCTOU window (B-06). Admission inserts a reservation for the
 * worst-case MNT estimate inside the same transaction that sums the
 * other active reservations, so N concurrent requests can't all be
 * admitted against the same balance. recordTokenUsage settles the
 * reservation; abandoned reservations expire via expires_at and are
 * ignored by the sum (cleanup cron deletes them).
 *
 * This is the seed of the Phase 2 `credit_reservations` table from the
 * v2 architecture plan (ADR-0004).
 */
export const creditReservations = pgTable(
  "credit_reservations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Correlates admission with settlement — future execution id. */
    requestId: text("request_id").notNull().unique(),
    estimatedMnt: integer("estimated_mnt").notNull(),
    status: text("status").notNull().default("active"), // active | settled
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    settledAt: timestamp("settled_at"),
  },
  (table) => [
    index("credit_reservations_active_idx").on(
      table.workspaceId,
      table.status,
      table.expiresAt
    ),
  ]
);

// Export inferred types for TypeScript usage
export type Plan = typeof plans.$inferSelect;
export type InsertPlan = typeof plans.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;
export type CreditBalance = typeof creditBalances.$inferSelect;
export type InsertCreditBalance = typeof creditBalances.$inferInsert;
export type CreditPurchase = typeof creditPurchases.$inferSelect;
export type InsertCreditPurchase = typeof creditPurchases.$inferInsert;
export type FinanceEvent = typeof financeEvents.$inferSelect;
export type InsertFinanceEvent = typeof financeEvents.$inferInsert;
export type BillingSettings = typeof billingSettings.$inferSelect;
export type InsertBillingSettings = typeof billingSettings.$inferInsert;
export type CreditReservation = typeof creditReservations.$inferSelect;
export type InsertCreditReservation = typeof creditReservations.$inferInsert;
