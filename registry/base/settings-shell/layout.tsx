/**
 * Settings layout — the shared frame around every `/settings/*` page.
 *
 * Server component; only the tab bar is client (it needs `usePathname`
 * for the active highlight). Keeping the layout on the server means
 * every settings sub-page stays server-rendered by default, and none of
 * the settings tree is forced into the client bundle because one header
 * element is dynamic.
 *
 * The settings pages themselves (`profile-settings`,
 * `workspace-settings`, `team-settings`, `billing-settings`,
 * `privacy-settings`) render bare `space-y-*` roots on purpose — this
 * layout owns the page padding, the width constraint, the "Settings"
 * heading, and the tab navigation between them, so the pages compose
 * under it without double chrome. Install this item alongside any of
 * them; without it they render flush against the shell.
 *
 * Which tabs appear is consumer config — `@/lib/settings-nav`, shipped
 * by this item and yours to edit (add a product tab, drop team for a
 * single-user product, reorder). See that file's doc comment.
 */

import { getTranslations } from "next-intl/server";

import { SettingsTabs } from "@/components/settings/settings-tabs";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("settings-shell");

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="p-4 md:p-8">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>

          <SettingsTabs />

          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}
