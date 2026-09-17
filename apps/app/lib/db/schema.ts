/**
 * Tables this application owns.
 *
 * Everything the framework needs — users, workspaces, members, plans,
 * subscriptions, credits, executions, audit events, notifications,
 * conversations, documents — is `@intelligo-dev/core`'s and arrives
 * with its own migrations. Define your product's tables here, scope
 * them to a workspace, and reference framework tables by import:
 *
 *   import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
 *   import { organization, users } from "@intelligo-dev/core/db/schema";
 *
 *   export const reports = pgTable("reports", {
 *     id: text("id").primaryKey(),
 *     workspaceId: text("workspace_id")
 *       .notNull()
 *       .references(() => organization.id, { onDelete: "cascade" }),
 *     createdBy: text("created_by").references(() => users.id),
 *     createdAt: timestamp("created_at").defaultNow().notNull(),
 *   });
 *
 * Then `pnpm db:generate` writes the migration into ./drizzle and
 * `pnpm db:migrate` applies it after the framework's chain.
 *
 * Intelligo never reads these tables (every table has one
 * owner), so their shape is entirely yours.
 */

export {};
