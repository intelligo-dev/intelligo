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
import { useTranslations } from "use-intl";
import { Bell } from "lucide-react";

import { useRouter } from "@showcase/i18n/navigation";
import { Button } from "@showcase/components/ui/button";
import { ScrollArea } from "@showcase/components/ui/scroll-area";
import { Separator } from "@showcase/components/ui/separator";
import { AnimatedList, AnimatedListItem } from "@showcase/components/ui/animated-list";
import { NotificationStack } from "@showcase/components/ui/notification-stack";

import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationData,
} from "@showcase/actions/notifications";
import {
  NotificationItem,
  notificationIcon,
  RelativeTime,
} from "./notification-item";

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
  /** Called after opening a notification's link — the bell closes its dropdown. */
  onNavigate?: () => void;
}

export function NotificationList({
  notifications,
  variant = "full",
  footer,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
}: NotificationListProps) {
  const t = useTranslations("notifications");
  const router = useRouter();
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

  // Rows rise in one after another; one that arrives later rises alone.
  const rows = items.map((notification) => (
    <AnimatedListItem as="div" key={notification.id}>
      <NotificationItem
        notification={notification}
        onMarkRead={handleMarkRead}
      />
    </AnimatedListItem>
  ));

  return (
    <div className="flex flex-col">
      {/* The heading belongs to whoever has no other one. In the bell
          dropdown this list is the whole surface, so it names itself;
          on the notifications page the page's own header already says
          "Notifications" one line above, and repeating it there read
          as a bug. The row disappears entirely when it would hold
          neither a title nor the mark-all action. */}
      {(variant === "compact" || hasUnread) && (
        <>
          <div
            className={`flex items-center px-4 py-3 ${
              variant === "compact" ? "justify-between" : "justify-end"
            }`}
          >
            {variant === "compact" ? (
              <h3 className="text-sm font-semibold">{t("list.title")}</h3>
            ) : null}
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
        </>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
          <Bell className="size-8" />
          <p className="text-sm">{t("list.emptyTitle")}</p>
          <p className="max-w-xs text-xs">{t("list.emptyDescription")}</p>
        </div>
      ) : variant === "compact" && hasUnread ? (
        // The dropdown is an inbox of what is new: unread notifications
        // fanned into a stack that springs apart on hover. Opening one
        // or dismissing it marks it read, and it leaves the stack.
        <div className="p-3">
          <NotificationStack
            items={items
              .filter((n) => !n.isRead)
              .map((n) => {
                const { Icon, color } = notificationIcon(n.type);
                return {
                  id: n.id,
                  title: n.title,
                  description: n.message,
                  time: <RelativeTime iso={n.createdAt} />,
                  icon: <Icon className={`size-4 ${color}`} />,
                  unread: true,
                };
              })}
            onItemClick={(item) => {
              handleMarkRead(item.id);
              const href = items.find((n) => n.id === item.id)?.href;
              if (href) {
                router.push(href);
                onNavigate?.();
              }
            }}
            onDismiss={(item) => handleMarkRead(item.id)}
            labels={{
              expand: t("stack.expand"),
              collapse: t("stack.collapse"),
              empty: t("stack.empty"),
              dismiss: t("stack.dismiss"),
              list: (count) => t("stack.list", { count }),
              unread: t("stack.unread"),
            }}
          />
        </div>
      ) : variant === "compact" ? (
        // `flex flex-col`: the viewport's `size-full` height is a
        // percentage, which resolves to `auto` against a capped-but-
        // indefinite root — the rows would spill past the cap instead
        // of scrolling under it.
        <ScrollArea className="flex max-h-100 flex-col">
          <AnimatedList as="div" className="flex flex-col">
            {rows}
          </AnimatedList>
        </ScrollArea>
      ) : (
        <AnimatedList as="div" className="flex flex-col">
          {rows}
        </AnimatedList>
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
