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
  bigint,
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
  /** The balance, in micros of `currency`. */
  balanceMicros: bigint("balance_micros", { mode: "number" })
    .notNull()
    .default(0),
  totalPurchasedMicros: bigint("total_purchased_micros", { mode: "number" })
    .notNull()
    .default(0),
  totalUsedMicros: bigint("total_used_micros", { mode: "number" })
    .notNull()
    .default(0),
  /** What this ledger is denominated in; a write in another is refused. */
  currency: text("currency").notNull().default("MNT"),
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
  /** The deployment's billing currency — every ledger row is in this. */
  currency: text("currency").notNull().default("MNT"),
  /** What one USD costs in it, in micros: 1_000_000 is a USD deployment. */
  usdRateMicros: bigint("usd_rate_micros", { mode: "number" })
    .notNull()
    .default(3_450_000_000),
  /** Margin over provider cost, in basis points of a multiplier: 40_000 = 4×. */
  marginBp: integer("margin_bp").notNull().default(40_000),
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
    /** What the buyer paid, in minor units of `priceCurrency`. */
    priceMinor: integer("price_minor"),
    priceCurrency: text("price_currency"),
    /**
     * What the workspace was granted, in micros of `grantedCurrency`.
     * Separate from the price on purpose: a pack sold for $5 grants an
     * amount of the billing currency, and conflating the two is how
     * 100,000 of one unit came to be sold for $5 of another.
     */
    grantedMicros: bigint("granted_micros", { mode: "number" }),
    grantedCurrency: text("granted_currency"),
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
  /** Stripe's own amount, in the minor units of `currency`. */
  amountMinor: integer("amount_minor"),
  currency: text("currency").default("USD"),
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
 * v2 architecture plan.
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
    /** The hold, in micros of `currency`. */
    estimatedMicros: bigint("estimated_micros", { mode: "number" })
      .notNull()
      .default(0),
    currency: text("currency").notNull().default("MNT"),
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
