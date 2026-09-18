/**
 * The user's notifications across every workspace, newest first (20 at
 * first), in an uncontrolled `NotificationList` that handles mark-read
 * and "Load more" itself.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { getNotifications } from "@/actions/notifications";
import { NotificationList } from "@/components/notifications/notification-list";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return { title: t("page.title") };
}

export default async function NotificationsPage() {
  const t = await getTranslations("notifications");

  return (
    <div className="container mx-auto max-w-2xl space-y-8 px-4 py-8">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{t("page.title")}</PageHeaderTitle>
          <PageHeaderDescription>{t("page.subtitle")}</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <Suspense fallback={null}>
        <NotificationsSection />
      </Suspense>
    </div>
  );
}

async function NotificationsSection() {
  const result = await getNotifications();

  if (!result.success) {
    return (
      <div className="rounded-lg border p-6 text-sm text-destructive">
        {result.error}
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <NotificationList notifications={result.data} variant="full" />
    </div>
  );
}
