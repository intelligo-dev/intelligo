/**
 * `/settings` index — a redirect to the first settings tab.
 *
 * The app-shell user menu (and anything else) can link to plain
 * `/settings` without knowing which tabs this deployment configured;
 * landing here forwards to `/settings/profile`. If your product wants a
 * real page at the settings root instead, replace this file — the tab
 * bar in `settings-tabs.tsx` already highlights the first tab for the
 * bare `/settings` path.
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
