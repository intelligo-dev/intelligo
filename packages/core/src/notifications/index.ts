/**
 * User notifications. User-scoped, not workspace-scoped, so a user sees
 * their notifications from every workspace.
 */

import { db } from "../db";
import { notifications } from "../db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import type { CreateNotificationParams } from "./types";

export type { NotificationType, CreateNotificationParams } from "./types";

export {
  triggerQuotaNotification,
  triggerTrialNotification,
  triggerPaymentFailedNotification,
  triggerTeamMemberJoinedNotification,
} from "./triggers";

/** Creates a notification; `metadata` is stored as a JSON string. */
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

/** The user's unread notifications, newest first. */
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

/** All of the user's notifications, newest first. */
export async function getNotifications(userId: string, limit: number = 50) {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map(parseMetadata);
}

export async function getNotificationCount(userId: string): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), eq(notifications.isRead, false))
    );

  return result?.count ?? 0;
}

/** Filters on userId as well, so users can only mark their own. */
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

export async function markAllAsRead(userId: string) {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(eq(notifications.userId, userId), eq(notifications.isRead, false))
    );
}

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
