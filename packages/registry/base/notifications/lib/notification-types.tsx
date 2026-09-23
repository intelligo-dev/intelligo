/**
 * Icons for the product's own notification types. Consumer-owned:
 * `intelligo sync` never overwrites this file.
 *
 * `createNotification` accepts any `type` string; a type listed here is
 * drawn with its `icon` and `className` (a semantic text colour), and
 * this map is consulted before the built-in types, so an entry can also
 * restyle one of those. Any other type falls back to a plain bell.
 *
 * ```ts
 * import { FileText } from "lucide-react";
 *
 * export const notificationTypes: NotificationTypeMap = {
 *   report_ready: { icon: FileText, className: "text-success" },
 * };
 * ```
 *
 * Imported only by client components: an icon is a component, which
 * cannot cross from a server component to a client one as a prop.
 */

import type { LucideIcon } from "lucide-react";

export interface NotificationTypeStyle {
  icon: LucideIcon;
  /** Colour class for the icon; defaults to `text-muted-foreground`. */
  className?: string;
}

export type NotificationTypeMap = Record<string, NotificationTypeStyle>;

export const notificationTypes: NotificationTypeMap = {};
