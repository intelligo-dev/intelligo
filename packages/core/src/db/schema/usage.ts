/**
 * Token consumption per request and aggregated per period, which the quota
 * engine checks before AI requests and records into after them.
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  bigint,
  real,
  index,
  unique,
  jsonb,
} from "drizzle-orm/pg-core";
import { organization, users } from "./auth";

/**
 * One row per AI request: tokens, model and agent, for per-model and
 * per-agent reporting.
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
    agent: text("agent"), // the product's agent slug
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    /**
     * What the provider charged, in USD micros. Integer on purpose: float
     * arithmetic accumulates sub-cent error over many records.
     */
    providerCostMicros: bigint("provider_cost_micros", { mode: "number" })
      .notNull()
      .default(0),
    /** Snapshots of the rate and margin this charge was computed with. */
    marginBp: integer("margin_bp").notNull().default(0),
    usdRateMicros: bigint("usd_rate_micros", { mode: "number" })
      .notNull()
      .default(0),
    /** Authoritative charge, in micros of `currency`. */
    chargedMicros: bigint("charged_micros", { mode: "number" })
      .notNull()
      .default(0),
    currency: text("currency").notNull().default("USD"),
    /** Request correlation id for log tracing */
    requestId: text("request_id"),
    /**
     * Owning execution (@intelligo-dev/executions). No FK: the executions
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
 * One row per workspace per billing period, incremented atomically, so a
 * quota check is O(1) instead of a SUM over usage_records.
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
    /** The plan allowance spent this period, in micros of `currency`. */
    allowanceUsedMicros: bigint("allowance_used_micros", { mode: "number" })
      .notNull()
      .default(0),
    currency: text("currency").notNull().default("USD"),
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
 * One-time trial grant, one per workspace (unique constraint). Separate from
 * purchased credits; used when the plan quota is exceeded or the credit
 * balance is zero. Status: active → depleted, converted or expired.
 */
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
    /** The grant, in micros of `currency`. */
    initialMicros: bigint("initial_micros", { mode: "number" })
      .notNull()
      .default(0),
    usedMicros: bigint("used_micros", { mode: "number" }).notNull().default(0),
    remainingMicros: bigint("remaining_micros", { mode: "number" })
      .notNull()
      .default(0),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("active"), // active|depleted|converted|expired
    provisionedAt: timestamp("provisioned_at").notNull().defaultNow(),
    trialEndDate: timestamp("trial_end_date"), // 14 days from provisioning
    depletedAt: timestamp("depleted_at"),
    convertedAt: timestamp("converted_at"),
    createdByIp: text("created_by_ip"),
    createdByEmail: text("created_by_email"),
    /**
     * Canonical form of createdByEmail for the per-email abuse check,
     * stored so the count can use an index instead of a full-table scan.
     */
    normalizedEmail: text("normalized_email"),
  },
  (table) => [
    index("trial_credits_expiry_idx").on(table.status, table.trialEndDate),
    index("trial_credits_normalized_email_idx").on(table.normalizedEmail),
  ]
);

/**
 * One row per (workspace, endpoint, minute bucket). Each request upserts the
 * row and atomically increments `count`, so N concurrent requests observe
 * 1..N and exactly `limit` are admitted. Old buckets are deleted by the
 * billing-maintenance job.
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
 * Sent quota and trial notifications. The unique constraint on
 * (workspaceId, type, periodKey) keeps one notification from being sent
 * twice in a billing period.
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
    channel: text("channel").notNull().default("console"), // "console" | "email"
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
 * Per-user, per-action usage counters, one row per user and workspace (not
 * per period). Counters live in the `usage` JSONB map and increment
 * atomically in SQL, so a quota check is O(1).
 */
export const userQuotas = pgTable(
  "user_quotas",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    plan: text("plan").notNull().default("free"), // free | standard | pro
    /**
     * Per-action counters keyed by the product's own action slugs
     * (`usage["chat"] = 42`), so a product adds a counter without a
     * migration.
     */
    usage: jsonb("usage").notNull().default({}),
    totalCostUsd: real("total_cost_usd").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("user_quotas_user_id_idx").on(table.userId),
    index("user_quotas_workspace_id_idx").on(table.workspaceId),
    // Unique per (user, workspace), not per user: a user in a paid and a
    // free workspace must not share one plan and one set of counters.
    unique("user_quotas_user_workspace_unique").on(
      table.userId,
      table.workspaceId
    ),
  ]
);

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
