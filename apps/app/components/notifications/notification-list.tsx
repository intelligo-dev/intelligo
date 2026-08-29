"use client";

/**
 * Notification list — a "Notifications" header (with "Mark all read" when
 * anything is unread), the rows, and an empty state. Used in two places
 * with two different data-ownership models:
 *
 * - The bell dropdown (`variant="compact"`) is driven by the polling
 *   `useNotifications` hook, which also owns the unread badge count.
 *   Pass `onMarkRead`/`onMarkAllRead` from the hook so this list's
 *   mark-read clicks stay in sync with that count — this is "controlled"
 *   mode.
 * - The full page (`variant="full"`, the default) has no external count
 *   to keep in sync, so when `onMarkRead`/`onMarkAllRead` are omitted
 *   this list manages its own optimistic state and calls the
 *   `@/actions/notifications` server actions directly — "uncontrolled"
 *   mode, the same pattern `MemberList`/`PendingInvitations` use in the
 *   team-settings item. Uncontrolled mode also owns "Load more": the
 *   underlying `getNotifications` core function takes a `limit`, not an
 *   offset or cursor, so "Load more" re-fetches with a larger limit
 *   rather than fetching a distinct next page (capped at 100).
 */

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationData,
} from "@/actions/notifications";
import { NotificationItem } from "./notification-item";

const PAGE_SIZE = 20;
const MAX_LIMIT = 100;

export interface NotificationListProps {
  notifications: NotificationData[];
  variant?: "compact" | "full";
  /** Rendered below the list, e.g. a "View all" link in the bell dropdown. */
  footer?: ReactNode;
  /** Pass both to run this list in controlled mode — see file doc comment. */
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
}

export function NotificationList({
  notifications,
  variant = "full",
  footer,
  onMarkRead,
  onMarkAllRead,
}: NotificationListProps) {
  const t = useTranslations("notifications");
  const controlled = onMarkRead !== undefined;

  const [ownedItems, setOwnedItems] = useState(notifications);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [, startTransition] = useTransition();

  const items = controlled ? notifications : ownedItems;
  const hasUnread = items.some((n) => !n.isRead);
  const canLoadMore =
    variant === "full" &&
    !controlled &&
    items.length >= limit &&
    limit < MAX_LIMIT;

  function handleMarkRead(id: string) {
    if (controlled) {
      onMarkRead?.(id);
      return;
    }
    setOwnedItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    startTransition(async () => {
      await markNotificationRead(id);
    });
  }

  function handleMarkAllRead() {
    if (controlled) {
      onMarkAllRead?.();
      return;
    }
    setOwnedItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  }

  function handleLoadMore() {
    const nextLimit = Math.min(limit + PAGE_SIZE, MAX_LIMIT);
    setIsLoadingMore(true);
    startTransition(async () => {
      const result = await getNotifications(nextLimit);
      if (result.success) {
        setOwnedItems(result.data);
        setLimit(nextLimit);
      }
      setIsLoadingMore(false);
    });
  }

  const rows = items.map((notification) => (
    <NotificationItem
      key={notification.id}
      notification={notification}
      onMarkRead={handleMarkRead}
    />
  ));

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold">{t("list.title")}</h3>
        {hasUnread && (
          <button
            type="button"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            onClick={handleMarkAllRead}
          >
            {t("list.markAllRead")}
          </button>
        )}
      </div>
      <Separator />

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
          <Bell className="h-8 w-8" />
          <p className="text-sm">{t("list.emptyTitle")}</p>
          <p className="max-w-xs text-xs">{t("list.emptyDescription")}</p>
        </div>
      ) : variant === "compact" ? (
        <ScrollArea className="max-h-[400px]">
          <div className="flex flex-col">{rows}</div>
        </ScrollArea>
      ) : (
        <div className="flex flex-col">{rows}</div>
      )}

      {footer}

      {canLoadMore && (
        <div className="border-t p-3 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? t("list.loading") : t("list.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
