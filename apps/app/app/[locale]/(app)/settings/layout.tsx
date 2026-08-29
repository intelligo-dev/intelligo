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
