"use client";

/**
 * Client-side settings tab bar.
 *
 * Its own component so the parent `settings/layout.tsx` can stay a
 * server component — only the active-tab highlighting (which needs
 * `usePathname`) runs on the client.
 *
 * Tabs come from `@/lib/settings-nav` (consumer config, shipped by this
 * item). Each tab's `titleKey` is a fully-qualified message key
 * resolved through a namespace-less `useTranslations()` — the same
 * contract as `chatConfig.starters` — so a tab a consumer adds can
 * point into any namespace it owns, not just this item's.
 *
 * Navigation goes through `@/i18n/navigation` (ADR-0010): `Link`
 * localizes the href, and `usePathname` returns the locale-stripped
 * path, so `endsWith` matching works identically in every locale.
 */

import { useTranslations } from "use-intl";

import { Link, usePathname } from "@showcase/i18n/navigation";
import { Tabs, TabsList, TabsTrigger } from "@showcase/components/ui/tabs";
import { settingsTabs } from "@showcase/lib/settings-nav";

function activeTabValue(pathname: string | null): string {
  const fallback = settingsTabs[0]?.value ?? "";
  if (!pathname) return fallback;
  for (const tab of settingsTabs) {
    if (pathname.endsWith(tab.href)) return tab.value;
  }
  // Bare `/settings` (the index redirect, or a consumer page mounted
  // there) highlights the first tab rather than nothing.
  return fallback;
}

export function SettingsTabs() {
  // Namespace-less: `titleKey` values are fully-qualified (see the
  // module doc comment).
  const t = useTranslations();
  const pathname = usePathname();
  const activeTab = activeTabValue(pathname);

  return (
    <Tabs value={activeTab}>
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
        {settingsTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link key={tab.value} href={tab.href}>
              <TabsTrigger
                value={tab.value}
                className="gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm"
              >
                <Icon className="h-4 w-4" />
                {t(tab.titleKey)}
              </TabsTrigger>
            </Link>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
