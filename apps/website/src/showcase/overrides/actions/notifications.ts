import { wait, daysAgo } from "./_preview";

export type ActionResult<T> =
  { success: true; data: T } | { success: false; error: string };
export type NotificationData = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  href?: string;
};

export const NOTIFICATIONS: NotificationData[] = [
  {
    id: "n1",
    type: "team.member_joined",
    title: "Maria joined Acme Research",
    message: "maria@acme.co accepted your invitation as admin.",
    isRead: false,
    createdAt: daysAgo(0, 2),
    href: "/settings/team",
  },
  {
    id: "n2",
    type: "billing.payment_received",
    title: "Payment received",
    message: "Your Pro subscription renewed — $29.00.",
    isRead: false,
    createdAt: daysAgo(0, 9),
    href: "/settings/billing",
  },
  {
    id: "n3",
    type: "documents.ready",
    title: "Export ready",
    message: "Q3 summary (v3) is ready to download.",
    isRead: true,
    createdAt: daysAgo(1, 3),
    href: "/artifacts",
  },
  {
    id: "n4",
    type: "quota.warning",
    title: "80% of your monthly quota used",
    message: "1.96M of 2.5M tokens this period.",
    isRead: true,
    createdAt: daysAgo(2),
    href: "/usage",
  },
];

export async function getNotifications(
  ..._args: unknown[]
): Promise<ActionResult<NotificationData[]>> {
  await wait(300);
  return { success: true, data: NOTIFICATIONS };
}
export async function getUnreadNotifications(
  ..._args: unknown[]
): Promise<ActionResult<NotificationData[]>> {
  await wait(300);
  return { success: true, data: NOTIFICATIONS.filter((n) => !n.isRead) };
}
export async function getUnreadCount(): Promise<ActionResult<number>> {
  return { success: true, data: NOTIFICATIONS.filter((n) => !n.isRead).length };
}
export async function markNotificationRead(
  ..._args: unknown[]
): Promise<ActionResult<undefined>> {
  await wait(200);
  return { success: true, data: undefined };
}
export async function markAllNotificationsRead(): Promise<
  ActionResult<undefined>
> {
  await wait(200);
  return { success: true, data: undefined };
}
