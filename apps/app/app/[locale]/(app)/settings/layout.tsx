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
