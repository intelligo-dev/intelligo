/**
 * `/settings` index — a redirect to the first settings tab.
 *
 * Lets anything link to plain `/settings` without knowing the tab
 * configuration. Replace this file for a real page at the settings
 * root — the tab bar already highlights the first tab there.
 *
 * next-intl's `redirect` needs the current locale passed explicitly
 * (`{ href, locale }`) — it does not infer it in a server component.
 */

import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

export default async function SettingsIndexPage() {
  const locale = await getLocale();
  redirect({ href: "/settings/profile", locale });
}
