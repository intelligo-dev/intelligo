/**
 * @intelligo-dev/audit database schema.
 *
 * One append-only table recording who did what to which resource.
 * Owned by this package per ADR-0004; scanned by drizzle-kit alongside
 * the core schema directory (see packages/core/drizzle.config.ts) so
 * the migration history stays unified in one database.
 *
 * Distinct from `user_memory_audit` in core/identity, which records
 * mutations to a user's memory graph and predates this table. That one
 * folds in here once the memory subsystem's ownership is settled
 * (see docs/inventory/export-classification.md).
 */

import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { organization, users } from "@intelligo-dev/core/db/schema";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    /**
     * Null for platform-level events with no tenant — and, since
     * migration 0041, for events whose workspace was since deleted:
     * the trail outlives the tenant (set null, not cascade).
     */
    workspaceId: text("workspace_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    /** Null for system actors (cron, webhook, job runner). */
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** "user" | "system" | "support" — who initiated the action. */
    actorKind: text("actor_kind").notNull().default("user"),
    /** Dotted verb: "execution.completed", "credits.reserved", … */
    action: text("action").notNull(),
    /** Resource type the action applied to: "execution", "workspace", … */
    resourceKind: text("resource_kind").notNull(),
    /** Identifier of that resource; free-form (uuid, slug, email). */
    resourceId: text("resource_id"),
    /** "ok" | "failed" — outcome of the audited action. */
    outcome: text("outcome").notNull().default("ok"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
    index("audit_events_action_idx").on(table.action, table.createdAt),
    index("audit_events_resource_idx").on(table.resourceKind, table.resourceId),
  ]
);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = typeof auditEvents.$inferInsert;
