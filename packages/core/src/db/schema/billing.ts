/**
 * Plans, subscriptions, credit ledgers, purchases and Stripe events.
 * Amounts in the credit ledgers are micros of their currency.
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
 * The registered plan catalogue, copied into rows so a subscription can
 * reference its plan. The catalogue is the source: the rows are written
 * from it at boot, and an edit made here is overwritten by the next one.
 */
export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  /**
   * Whole major units — 29 is twenty-nine of the currency, not cents —
   * rounded from the catalogue's price. 0 for free. The row names no
   * currency; readers take the deployment's billing currency.
   */
  priceMonthly: integer("price_monthly").notNull(),
  /** Whole major units, as `priceMonthly`. 0 when the plan has no yearly price. */
  priceYearly: integer("price_yearly").notNull(),
  stripePriceIdMonthly: text("stripe_price_id_monthly"),
  stripePriceIdYearly: text("stripe_price_id_yearly"),
  features: text("features").notNull(), // JSON string array
  limits: text("limits").notNull(), // JSON string: { tokens, conversations, teamMembers, workspaces, documents }
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** One subscription per workspace (unique constraint). */
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

/** One credit balance per workspace (unique constraint). */
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
  currency: text("currency").notNull().default("USD"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Singleton (id = "default") holding the FX rate and margin, so they change
 * without a deploy. Read per request, cached 60s in-process.
 */
export const billingSettings = pgTable("billing_settings", {
  id: text("id").primaryKey(),
  /** The deployment's billing currency — every ledger row is in this. */
  currency: text("currency").notNull().default("USD"),
  /** What one USD costs in it, in micros: 1_000_000 is a USD deployment. */
  usdRateMicros: bigint("usd_rate_micros", { mode: "number" })
    .notNull()
    .default(1_000_000),
  /** Margin over provider cost, in basis points of a multiplier: 40_000 = 4×. */
  marginBp: integer("margin_bp").notNull().default(40_000),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** One-time credit purchases. */
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
     * amount of the billing currency, which is a different unit.
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

/** Every Stripe event, for idempotent webhook processing and audit. */
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
  /**
   * When a delivery took the event for processing. A lease: a claim
   * older than the webhook's lease is taken as a delivery that died.
   */
  claimedAt: timestamp("claimed_at"),
  /** Set once the handlers finished; the event is never run again. */
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Closes the admission → settlement race. Admission inserts a reservation
 * for the worst-case estimate inside the same transaction that sums the
 * other active reservations, so concurrent requests cannot all be admitted
 * against the same balance. Settlement closes the reservation; abandoned
 * ones expire via `expires_at`, are ignored by the sum, and are deleted by
 * a cleanup job.
 */
export const creditReservations = pgTable(
  "credit_reservations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Correlates admission with settlement. */
    requestId: text("request_id").notNull().unique(),
    /** The hold, in micros of `currency`. */
    estimatedMicros: bigint("estimated_micros", { mode: "number" })
      .notNull()
      .default(0),
    currency: text("currency").notNull().default("USD"),
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
