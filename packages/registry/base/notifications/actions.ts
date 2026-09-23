"use server";

/**
 * Notification actions over `@intelligo-dev/core/notifications`.
 *
 * User-scoped, not workspace-scoped: `requireAuth()`, not
 * `requireWorkspace()`, because notifications span every workspace a user
 * belongs to and are shown in one list.
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { requireAuth } from "@intelligo-dev/auth";
import {
  getNotifications as coreGetNotifications,
  getUnreadNotifications as coreGetUnreadNotifications,
  getNotificationCount,
  markAsRead,
  markAllAsRead,
} from "@intelligo-dev/core/notifications";
import type { ActionResult as BaseActionResult } from "@intelligo-dev/next";

export type ActionResult<T> = BaseActionResult<T>;

export type NotificationData = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  /** ISO string — Dates don't cross the server action boundary as-is. */
  createdAt: string;
  /**
   * Optional deep link, read from `metadata.href`: pass
   * `metadata: { href: "/billing" }` to `createNotification()`. The table
   * has no link column, and the built-in triggers set none. `null` when
   * absent.
   */
  href: string | null;
};

// The core reads take a `limit`, not an offset or cursor, so "Load more"
// re-fetches with a larger limit, up to the ceiling.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const NOTIFICATIONS_PATH = "/notifications";

type CoreNotification = Awaited<
  ReturnType<typeof coreGetNotifications>
>[number];

function clampLimit(limit: number): number {
  return Math.min(Math.max(Math.trunc(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function toNotificationData(row: CoreNotification): NotificationData {
  const href =
    typeof row.metadata?.href === "string" ? row.metadata.href : null;

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
    href,
  };
}

/**
 * The reader gets the translated fallback; the error itself goes to the
 * server log. `Error#message` can carry internals (SQL, hostnames).
 */
function errorMessage(error: unknown, fallback: string): string {
  console.error("[notifications]", error);
  return fallback;
}

/**
 * All notifications (read and unread) for the current user, newest first.
 * Powers the full notifications page; `limit` grows for "Load more".
 */
export async function getNotifications(
  limit: number = DEFAULT_LIMIT
): Promise<ActionResult<NotificationData[]>> {
  try {
    const { user } = await requireAuth();
    const rows = await coreGetNotifications(user.id, clampLimit(limit));
    return { success: true, data: rows.map(toNotificationData) };
  } catch (error) {
    const t = await getTranslations("notifications");
    return {
      success: false,
      error: errorMessage(error, t("errors.loadNotifications")),
    };
  }
}

/**
 * Unread notifications for the current user, newest first. Powers the
 * bell dropdown's recent list.
 */
export async function getUnreadNotifications(
  limit: number = DEFAULT_LIMIT
): Promise<ActionResult<NotificationData[]>> {
  try {
    const { user } = await requireAuth();
    const rows = await coreGetUnreadNotifications(user.id, clampLimit(limit));
    return { success: true, data: rows.map(toNotificationData) };
  } catch (error) {
    const t = await getTranslations("notifications");
    return {
      success: false,
      error: errorMessage(error, t("errors.loadUnreadNotifications")),
    };
  }
}

/** Unread count for the current user. Powers the bell badge. */
export async function getUnreadCount(): Promise<ActionResult<number>> {
  try {
    const { user } = await requireAuth();
    const count = await getNotificationCount(user.id);
    return { success: true, data: count };
  } catch (error) {
    const t = await getTranslations("notifications");
    return {
      success: false,
      error: errorMessage(error, t("errors.loadUnreadCount")),
    };
  }
}

/**
 * Marks one notification as read. The update is scoped to
 * `(notificationId, userId)`, so it cannot touch another user's.
 */
export async function markNotificationRead(
  notificationId: string
): Promise<ActionResult<undefined>> {
  try {
    const { user } = await requireAuth();
    await markAsRead(notificationId, user.id);
    revalidatePath(NOTIFICATIONS_PATH);
    return { success: true, data: undefined };
  } catch (error) {
    const t = await getTranslations("notifications");
    return {
      success: false,
      error: errorMessage(error, t("errors.markRead")),
    };
  }
}

/** Mark every unread notification as read for the current user. */
export async function markAllNotificationsRead(): Promise<
  ActionResult<undefined>
> {
  try {
    const { user } = await requireAuth();
    await markAllAsRead(user.id);
    revalidatePath(NOTIFICATIONS_PATH);
    return { success: true, data: undefined };
  } catch (error) {
    const t = await getTranslations("notifications");
    return {
      success: false,
      error: errorMessage(error, t("errors.markAllRead")),
    };
  }
}
