"use client";

/**
 * Bell with an unread badge that opens a dropdown of recent
 * notifications. Nothing mounts it for you: put it in the shell, e.g.
 * through `shellConfig.headerRight`.
 *
 * With no props it fetches on mount. Pass `initialCount` and
 * `initialNotifications` from a server component for a faster first
 * paint; it then skips that fetch.
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
import { SwapText } from "@showcase/components/ui/ai-motion";
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
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-xs text-destructive-foreground">
            {/* A new count rolls in rather than replacing the old one. */}
            <SwapText value={String(unreadCount)}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </SwapText>
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <NotificationList
          notifications={notifications}
          variant="compact"
          onMarkRead={markRead}
          onMarkAllRead={markAllRead}
          onNavigate={() => setIsOpen(false)}
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
