import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { organization, users } from "./auth";

/**
 * User-scoped, not workspace-scoped, so a user sees their notifications from
 * every workspace in one place. `workspaceId` is null for user-level
 * notifications. Deleting the user or the workspace deletes the rows.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
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
    index("notifications_workspace_id_idx").on(table.workspaceId),
  ]
);

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
