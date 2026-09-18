/**
 * Settings layout — the shared frame around every `/settings/*` page.
 *
 * A server component; only the tab bar runs on the client (it needs
 * `usePathname`).
 *
 * The settings pages (`profile-settings`, `workspace-settings`,
 * `team-settings`, `billing-settings`, `privacy-settings`) render bare
 * `space-y-*` roots — this layout owns the padding, width, heading and
 * tabs. Without it they render flush against the shell.
 *
 * Which tabs appear is consumer config in `@/lib/settings-nav`.
 */

import { getTranslations } from "next-intl/server";

import { SettingsTabs } from "@/components/settings/settings-tabs";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
} from "@/components/ui/page-header";

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
          <PageHeader>
            <PageHeaderContent>
              <PageHeaderTitle>{t("title")}</PageHeaderTitle>
            </PageHeaderContent>
          </PageHeader>

          <SettingsTabs />

          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}
