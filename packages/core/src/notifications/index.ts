/**
 * Notifications Module
 *
 * CRUD operations for user notifications. These are used by server actions
 * in the consumer application to power the notification bell, list, and
 * mark-as-read functionality.
 *
 * Notifications are user-scoped (not workspace-scoped) so a user can see
 * all their notifications across workspaces.
 */

import { db } from "../db";
import { notifications } from "../db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import type { CreateNotificationParams } from "./types";

// Re-export types for convenience
export type { NotificationType, CreateNotificationParams } from "./types";

// Re-export trigger functions
export {
  triggerQuotaNotification,
  triggerTrialNotification,
  triggerPaymentFailedNotification,
  triggerTeamMemberJoinedNotification,
} from "./triggers";

/**
 * Create a new notification for a user
 *
 * Serializes metadata to JSON string if provided.
 * Returns the created notification.
 */
export async function createNotification(params: CreateNotificationParams) {
  const [notification] = await db
    .insert(notifications)
    .values({
      userId: params.userId,
      workspaceId: params.workspaceId,
      type: params.type,
      title: params.title,
      message: params.message,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    })
    .returning();

  return notification;
}

/**
 * Get unread notifications for a user
 *
 * Returns notifications where isRead is false, ordered by newest first.
 * Parses metadata JSON string back to object.
 */
export async function getUnreadNotifications(
  userId: string,
  limit: number = 20
) {
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), eq(notifications.isRead, false))
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map(parseMetadata);
}

/**
 * Get all notifications for a user (read and unread)
 *
 * Returns notifications ordered by newest first.
 * Parses metadata JSON string back to object.
 */
export async function getNotifications(userId: string, limit: number = 50) {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map(parseMetadata);
}

/**
 * Get count of unread notifications for a user
 *
 * Used for the notification bell badge number.
 */
export async function getNotificationCount(userId: string): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), eq(notifications.isRead, false))
    );

  return result?.count ?? 0;
}

/**
 * Mark a single notification as read
 *
 * Security: requires both notificationId and userId to ensure
 * users can only mark their own notifications.
 */
export async function markAsRead(notificationId: string, userId: string) {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      )
    );
}

/**
 * Mark all unread notifications as read for a user
 */
export async function markAllAsRead(userId: string) {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(eq(notifications.userId, userId), eq(notifications.isRead, false))
    );
}

/**
 * Parse metadata JSON string back to object
 *
 * Returns notification with metadata as parsed object (or null if no metadata).
 */
function parseMetadata<T extends { metadata: string | null }>(
  notification: T
): T & { metadata: Record<string, unknown> | null } {
  return {
    ...notification,
    metadata: notification.metadata
      ? (JSON.parse(notification.metadata) as Record<string, unknown>)
      : null,
  };
}
