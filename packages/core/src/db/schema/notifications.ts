/**
 * Notifications Database Schema
 *
 * Persistent notifications for users (quota warnings, payment events, team updates).
 * These are user-scoped (not workspace-scoped) so a user sees all their notifications
 * across workspaces in one place.
 *
 * Pattern: snake_case columns in PostgreSQL, camelCase TypeScript API (via Drizzle mapping)
 */

import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

/**
 * Notifications table - User-facing notification records (NOTIF-06)
 *
 * Each notification has a type (matching NotificationType), a title/message for display,
 * and optional metadata for additional context. The isRead flag supports read/unread
 * filtering for the notification bell badge.
 *
 * userId references Better-Auth's user table by convention (no FK constraint).
 * workspaceId is nullable — some notifications are user-level (e.g., payment_failed).
 */
export const notifications = pgTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    workspaceId: text("workspace_id"),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    metadata: text("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_user_id_is_read_idx").on(table.userId, table.isRead),
    index("notifications_created_at_idx").on(table.createdAt),
  ]
);

// Export inferred types for TypeScript usage
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
