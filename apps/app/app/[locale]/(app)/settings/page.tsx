import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

export default async function SettingsIndexPage() {
  const locale = await getLocale();
  redirect({ href: "/settings/profile", locale });
}
