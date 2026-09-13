"use client";

/**
 * Notification bell — icon button with an unread-count badge that opens
 * a popover dropdown of recent notifications. This is exported for a
 * consumer to mount wherever their shell puts header/sidebar actions;
 * it is not auto-mounted by any other registry item (the app-shell item
 * stays decoupled from this one).
 *
 * Self-sufficient by default: with no props it fetches its own initial
 * data on mount via `useNotifications`. Pass `initialCount`/
 * `initialNotifications` from a server component up the tree (e.g. the
 * shell's layout) for a faster first paint — the hook then skips its
 * own mount-time fetch and starts from those values.
 */

import { useState } from "react";
import { useTranslations } from "use-intl";
import { Bell } from "lucide-react";

import { Button } from "@showcase/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@showcase/components/ui/popover";
import { Link } from "@showcase/i18n/navigation";

import { useNotifications } from "@showcase/hooks/use-notifications";
import type { NotificationData } from "@showcase/actions/notifications";
import { NotificationList } from "./notification-list";

export interface NotificationBellProps {
  initialCount?: number;
  initialNotifications?: NotificationData[];
  /** Where "View all" links. Matches this item's own installed page. */
  notificationsHref?: string;
}

export function NotificationBell({
  initialCount,
  initialNotifications,
  notificationsHref = "/notifications",
}: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations("notifications");

  const { notifications, unreadCount, markRead, markAllRead } =
    useNotifications({
      initialCount,
      initialNotifications,
      // Skip polling while the user is reading the dropdown.
      paused: isOpen,
    });

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={
              unreadCount > 0
                ? t("bell.ariaLabelUnread", { count: unreadCount })
                : t("bell.ariaLabel")
            }
          />
        }
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-xs text-destructive-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <NotificationList
          notifications={notifications}
          variant="compact"
          onMarkRead={markRead}
          onMarkAllRead={markAllRead}
          footer={
            <Link
              href={notificationsHref}
              className="block border-t px-4 py-2 text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setIsOpen(false)}
            >
              {t("bell.viewAll")}
            </Link>
          }
        />
      </PopoverContent>
    </Popover>
  );
}
