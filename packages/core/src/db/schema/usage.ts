/**
 * Usage Tracking Database Schema
 *
 * Tables for tracking per-request token consumption and aggregated monthly usage.
 * Used by the quota enforcement engine to check limits before AI requests
 * and record consumption atomically after completion.
 *
 * Pattern: snake_case columns in PostgreSQL, camelCase TypeScript API (via Drizzle mapping)
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  index,
  unique,
  jsonb,
} from "drizzle-orm/pg-core";
import { organization, users } from "./auth";

/**
 * Usage Records table - Per-request token tracking (QUOTA-05)
 *
 * Every AI request creates one record with input/output/total tokens,
 * the model used, and the agent that handled it. This provides the
 * detailed breakdown for per-model and per-agent reporting (QUOTA-07).
 */
export const usageRecords = pgTable(
  "usage_records",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // "ai_tokens", "api_call"
    model: text("model"), // "gpt-4o", "gpt-4o-mini"
    agent: text("agent"), // "support-assistant", "study"
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    /**
     * Raw provider USD cost snapshot (kept under legacy column name for back-compat).
     * Do NOT use for arithmetic — floating-point accumulation causes sub-cent
     * discrepancies over many records. Use chargedMnt (integer MNT) for all math.
     */
    cost: real("cost").notNull().default(0),
    /** Snapshot of billing margin multiplier applied to this request */
    marginMultiplier: real("margin_multiplier").notNull().default(0),
    /** Snapshot of USD→MNT FX rate used for conversion */
    fxRate: real("fx_rate").notNull().default(0),
    /** Authoritative MNT amount deducted from balance */
    chargedMnt: integer("charged_mnt").notNull().default(0),
    /** Request correlation id for log tracing */
    requestId: text("request_id"),
    /**
     * Owning execution (@intelligo/executions). No FK: the executions
     * table is owned by another package and this column is written by
     * the settlement path, which may run before or after the execution
     * row's terminal update.
     */
    executionId: text("execution_id"),
    /** Conversation/chat id for grouping in usage dashboards */
    conversationId: text("conversation_id"),
    metadata: text("metadata"), // JSON string for additional data
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  },
  (table) => [
    index("usage_records_workspace_id_idx").on(table.workspaceId),
    index("usage_records_workspace_recorded_at_idx").on(
      table.workspaceId,
      table.recordedAt
    ),
    index("usage_records_workspace_type_idx").on(table.workspaceId, table.type),
    index("usage_records_conversation_id_idx").on(table.conversationId),
    index("usage_records_execution_id_idx").on(table.executionId),
  ]
);

/**
 * Monthly Usage table - Aggregated monthly totals for fast quota checks
 *
 * Instead of SUM(totalTokens) on every request, we increment a counter atomically.
 * One row per workspace per billing period. The usage_records table provides
 * the detailed breakdown for reporting; this table provides O(1) quota checks.
 */
export const monthlyUsage = pgTable(
  "monthly_usage",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    tokensUsed: integer("tokens_used").notNull().default(0),
    /** MNT-denominated total charged this period — authoritative for plan quota */
    chargedMnt: integer("charged_mnt").notNull().default(0),
    requestCount: integer("request_count").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("monthly_usage_workspace_period_unique").on(
      table.workspaceId,
      table.periodStart
    ),
    index("monthly_usage_workspace_id_idx").on(table.workspaceId),
  ]
);

/**
 * Trial Credits table - One-time trial credit allocation per workspace (TRIAL-01)
 *
 * Each new workspace receives 100K trial tokens on creation.
 * The unique constraint on workspace_id enforces one trial per workspace (TRIAL-07).
 * Trial credits are separate from purchased credits (credit_balances).
 * They act as a fallback when plan quota is exceeded or credit balance is zero.
 *
 * Status flow: active → depleted (credits hit 0) or active → converted (paid plan)
 */
// Run drizzle-kit push to apply index
export const trialCredits = pgTable(
  "trial_credits",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: "cascade" }),
    initialCredits: integer("initial_credits").notNull().default(100000),
    creditsUsed: integer("credits_used").notNull().default(0),
    creditsRemaining: integer("credits_remaining").notNull().default(100000),
    /** MNT-denominated trial grant (replaces token-denominated columns above) */
    initialCreditsMnt: integer("initial_credits_mnt").notNull().default(5000),
    creditsUsedMnt: integer("credits_used_mnt").notNull().default(0),
    creditsRemainingMnt: integer("credits_remaining_mnt")
      .notNull()
      .default(5000),
    status: text("status").notNull().default("active"), // active|depleted|converted|expired
    provisionedAt: timestamp("provisioned_at").notNull().defaultNow(),
    trialEndDate: timestamp("trial_end_date"), // 14 days from provisioning
    depletedAt: timestamp("depleted_at"),
    convertedAt: timestamp("converted_at"),
    createdByIp: text("created_by_ip"),
    createdByEmail: text("created_by_email"),
    /**
     * Canonical form of createdByEmail used by the per-email abuse
     * check. Stored alongside the raw value so `SELECT count(*)`
     * can use an index instead of a full-table scan + JS filter.
     * See packages/billing/src/trial.ts:normalizeEmailForAbuseCheck.
     */
    normalizedEmail: text("normalized_email"),
  },
  (table) => [
    index("trial_credits_expiry_idx").on(table.status, table.trialEndDate),
    index("trial_credits_normalized_email_idx").on(table.normalizedEmail),
  ]
);

/**
 * Rate Limit Entries table - Sliding window rate limiting (QUOTA-10)
 *
 * One row per (workspace, endpoint, minute bucket), with a counter.
 * Each request upserts the row and atomically increments `count`, so N
 * concurrent requests observe 1..N and exactly `limit` are admitted.
 *
 * An earlier version used ON CONFLICT DO NOTHING, which admitted
 * exactly ONE request per minute on every plan — the per-plan limit was
 * never consulted. See packages/billing/src/rate-limit.ts.
 *
 * Old buckets are deleted by the billing-maintenance cron.
 *
 * Database-backed rate limiting is the correct choice for <10K users
 * (no Redis dependency, per architecture decisions).
 */
export const rateLimitEntries = pgTable(
  "rate_limit_entries",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().default("chat"),
    requestedAt: timestamp("requested_at").notNull().defaultNow(),
    /** Floored minute bucket for unique constraint enforcement */
    minuteBucket: timestamp("minute_bucket").notNull(),
    /** Requests observed in this bucket — incremented via upsert */
    count: integer("count").notNull().default(1),
  },
  (table) => [
    index("rate_limit_entries_window_idx").on(
      table.workspaceId,
      table.endpoint,
      table.requestedAt
    ),
    unique("rate_limit_entries_unique_bucket_idx").on(
      table.workspaceId,
      table.endpoint,
      table.minuteBucket
    ),
  ]
);

/**
 * Notification History table - Tracks sent notifications for deduplication
 *
 * Records each notification sent (quota warnings, trial alerts) with a
 * period-based deduplication key. The unique constraint on
 * (workspaceId, type, periodKey) prevents sending the same notification
 * twice in the same billing period.
 *
 * Phase 14 will update the channel from "console" to "email" and use
 * Resend for actual delivery. For now, notifications are logged to console.
 */
export const notificationHistory = pgTable(
  "notification_history",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // "quota_warning_80", "quota_warning_100", "trial_warning_20", "trial_depleted"
    periodKey: text("period_key").notNull(), // "2026-02" for monthly, "trial" for one-time
    sentAt: timestamp("sent_at").notNull().defaultNow(),
    channel: text("channel").notNull().default("console"), // "console" now, "email" in Phase 14
    metadata: text("metadata"), // JSON string for additional context
  },
  (table) => [
    unique("notification_history_dedup_unique").on(
      table.workspaceId,
      table.type,
      table.periodKey
    ),
    index("notification_history_workspace_id_idx").on(table.workspaceId),
  ]
);

/**
 * User Quotas table — per-user, per-action usage counters.
 *
 * One row per user (not per period — one-time payment model). Counters
 * live in the `usage` JSONB map and increment atomically in SQL, so a
 * quota check is O(1) with no SUM over usage_records.
 */
export const userQuotas = pgTable(
  "user_quotas",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    plan: text("plan").notNull().default("free"), // free | standard | pro
    /**
     * Per-action counter map, keyed by the product's own action slugs
     * (`usage["chat"] = 42`). This is the only counter storage.
     *
     * Three support-specific integer columns — chat_messages_used,
     * assessments_used, reports_used — used to sit beside it, written
     * by every product and read in preference to this map. Migration
     * 0038 backfilled them into the map and dropped them: a public
     * schema naming one vertical's actions meant no other vertical
     * could add a counter without a migration to Intelligo (ADR-0004).
     */
    usage: jsonb("usage").notNull().default({}),
    totalCostUsd: real("total_cost_usd").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("user_quotas_user_id_idx").on(table.userId),
    index("user_quotas_workspace_id_idx").on(table.workspaceId),
  ]
);

// Export inferred types for TypeScript usage
export type UserQuota = typeof userQuotas.$inferSelect;
export type InsertUserQuota = typeof userQuotas.$inferInsert;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type InsertUsageRecord = typeof usageRecords.$inferInsert;
export type MonthlyUsage = typeof monthlyUsage.$inferSelect;
export type InsertMonthlyUsage = typeof monthlyUsage.$inferInsert;
export type TrialCredit = typeof trialCredits.$inferSelect;
export type InsertTrialCredit = typeof trialCredits.$inferInsert;
export type RateLimitEntry = typeof rateLimitEntries.$inferSelect;
export type InsertRateLimitEntry = typeof rateLimitEntries.$inferInsert;
export type NotificationHistoryRecord = typeof notificationHistory.$inferSelect;
export type InsertNotificationHistoryRecord =
  typeof notificationHistory.$inferInsert;
