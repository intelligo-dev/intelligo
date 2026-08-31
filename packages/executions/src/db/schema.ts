/**
 * @intelligo-dev/executions database schema.
 *
 * One row per AI execution: who ran what capability, whether it was
 * admitted, how it ended, and what it cost. This is the narrow SaaS
 * boundary from ADR-0003 — it deliberately records nothing about
 * agents, tools, workflows, or messages, which stay native to the
 * chosen AI framework.
 *
 * Relationship to the existing usage tables (ADR-0004):
 *   - `usage_records` is the per-request usage/cost detail. It IS the
 *     "usage_events"/"cost_events" of the target structure under its
 *     current name; it gains an `execution_id` FK here rather than
 *     being duplicated. The rename happens with the package split.
 *   - `monthly_usage` stays the O(1) rollup.
 *   - `credit_reservations` (owned by credits/billing today) holds the
 *     admission hold; `executions.request_id` is the correlation key
 *     between the two.
 *
 * Scanned by drizzle-kit alongside the core schema directory — see
 * packages/core/drizzle.config.ts.
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organization, users } from "@intelligo-dev/core/db/schema";

export const executions = pgTable(
  "executions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * What the caller asked for, in the product's own vocabulary:
     * "support.reply", "chat.message". Opaque to Intelligo —
     * used for entitlement decisions, grouping, and admin filtering.
     */
    capability: text("capability").notNull(),
    /**
     * Correlation key shared with credit_reservations and
     * usage_records. Unique per execution attempt.
     */
    requestId: text("request_id").notNull().unique(),
    /**
     * running | settling | succeeded | failed | refused.
     * `settling` is the window between claiming the row and confirming
     * the charge; a row that stays there needs an operator.
     */
    status: text("status").notNull().default("running"),
    /** Model actually used; null until the run reports one. */
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    /** Authoritative charge in MNT, mirrored from usage_records. */
    chargedMnt: integer("charged_mnt"),
    /** Worst-case estimate held at admission. */
    reservedMnt: integer("reserved_mnt"),
    /** Populated on status=refused: why entitlement said no. */
    refusalReason: text("refusal_reason"),
    /** Populated on status=failed. */
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
    durationMs: integer("duration_ms"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("executions_workspace_started_idx").on(
      table.workspaceId,
      table.startedAt
    ),
    index("executions_status_idx").on(table.status, table.startedAt),
    index("executions_capability_idx").on(table.capability, table.startedAt),
  ]
);

export type Execution = typeof executions.$inferSelect;
export type InsertExecution = typeof executions.$inferInsert;
