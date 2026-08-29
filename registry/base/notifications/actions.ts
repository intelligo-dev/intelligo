"use server";

/**
 * Notification server actions — thin wrappers over
 * `@intelligo/core/notifications`: parse nothing (no user input beyond an
 * id), authenticate with `requireAuth()`, call the core CRUD functions,
 * reshape rows for the client, and revalidate this item's own page.
 *
 * User-scoped, not workspace-scoped: `requireAuth()` only, deliberately
 * not `requireWorkspace()`. Notifications span every workspace a user
 * belongs to and are shown in one cross-workspace list.
 *
 * Fallback error strings (used only when the thrown value isn't an
 * `Error`) come from this item's `notifications` message namespace via
 * `getTranslations` (`next-intl/server`), not hardcoded English — see
 * `messages/en.json`'s `errors` key.
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { requireAuth } from "@intelligo/auth";
import {
  getNotifications as coreGetNotifications,
  getUnreadNotifications as coreGetUnreadNotifications,
  getNotificationCount,
  markAsRead,
  markAllAsRead,
} from "@intelligo/core/notifications";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type NotificationData = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  /** ISO string — Dates don't cross the server action boundary as-is. */
  createdAt: string;
  /**
   * Optional deep link for this notification.
   *
   * The `notifications` table (`packages/core/src/db/schema/notifications.ts`)
   * has no dedicated link column, and none of the built-in trigger functions
   * in `@intelligo/core/notifications/triggers` set one today. `metadata` is
   * free-form (`Record<string, unknown>` on `CreateNotificationParams`), so
   * this reads an optional `metadata.href` string when a product's own
   * `createNotification()`/trigger call chooses to include one — e.g.
   * `metadata: { href: "/billing" }`. `null` when absent, which is the
   * common case today.
   */
  href: string | null;
};

// A page size the caller can grow ("Load more") and a hard ceiling —
// `getNotifications`/`getUnreadNotifications` in `@intelligo/core` take a
// plain `limit`, not an offset or cursor, so there is no true page-based
// pagination to forward. See `notification-list.tsx` for how "Load more"
// is built on top of that: it re-fetches with a larger limit rather than
// fetching a distinct next page.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// The page this item installs to — kept in one place so both mutations
// revalidate the same route.
const NOTIFICATIONS_PATH = "/notifications";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Mark one notification as read. `markAsRead` in `@intelligo/core` scopes
 * the update to `(notificationId, userId)`, so this can't touch another
 * user's notification.
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
