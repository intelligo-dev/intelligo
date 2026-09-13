"use client";

/**
 * A single notification row: type icon, unread dot, title/message,
 * relative timestamp. Clicking an unread row marks it read. When the
 * notification carries a `href` (see `NotificationData.href` in
 * `@/actions/notifications`), the row is a link that navigates there in
 * addition to marking itself read; otherwise it's a plain button that
 * only marks-read.
 */

import { useEffect, useState } from "react";
import { useFormatter } from "use-intl";
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  CreditCard,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { Link } from "@showcase/i18n/navigation";
import type { NotificationData } from "@showcase/actions/notifications";

export interface NotificationItemProps {
  notification: NotificationData;
  onMarkRead: (id: string) => void;
}

/**
 * Relative timestamp that can't cause a hydration mismatch: the server
 * (and the first client render) show a locale-formatted absolute date,
 * and an effect swaps in the relative form once mounted — `Date.now()`
 * during render would differ between server and client.
 */
function RelativeTime({ iso }: { iso: string }) {
  const format = useFormatter();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const date = new Date(iso);
  return (
    <>
      {now
        ? format.relativeTime(date, now)
        : format.dateTime(date, { dateStyle: "medium" })}
    </>
  );
}

/**
 * Icon + color for a notification `type`. These match the built-in
 * types in `@intelligo-dev/core/notifications` (`NotificationType`); an
 * unrecognized type — e.g. a product's own custom type — falls back to
 * a plain bell rather than failing.
 */
function notificationIcon(type: string): { Icon: LucideIcon; color: string } {
  switch (type) {
    case "quota_warning_80":
      return { Icon: AlertTriangle, color: "text-amber-500" };
    case "quota_warning_100":
      return { Icon: AlertTriangle, color: "text-destructive" };
    case "trial_warning_20":
      return { Icon: Clock, color: "text-amber-500" };
    case "trial_depleted":
      return { Icon: Clock, color: "text-destructive" };
    case "payment_failed":
      return { Icon: CreditCard, color: "text-destructive" };
    case "team_member_joined":
      return { Icon: UserPlus, color: "text-emerald-500" };
    case "subscription_confirmed":
      return { Icon: CheckCircle, color: "text-emerald-500" };
    default:
      return { Icon: Bell, color: "text-muted-foreground" };
  }
}

export function NotificationItem({
  notification,
  onMarkRead,
}: NotificationItemProps) {
  const { id, type, title, message, isRead, createdAt, href } = notification;
  const { Icon, color } = notificationIcon(type);

  function handleClick() {
    if (!isRead) onMarkRead(id);
  }

  const rowClassName =
    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50";

  const content = (
    <>
      <span className="mt-2 flex-shrink-0" aria-hidden>
        <span
          className={`block size-2 rounded-full ${isRead ? "bg-transparent" : "bg-primary"}`}
        />
      </span>

      <span className={`mt-0.5 flex-shrink-0 ${color}`} aria-hidden>
        <Icon className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block line-clamp-2 text-sm text-muted-foreground">
          {message}
        </span>
      </span>

      <span className="flex-shrink-0 text-xs text-muted-foreground">
        <RelativeTime iso={createdAt} />
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={rowClassName} onClick={handleClick}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={rowClassName} onClick={handleClick}>
      {content}
    </button>
  );
}
