import { getTranslations } from "next-intl/server";

import { profile } from "@/lib/profile";
import { ProfileSettingsForm } from "@/components/profile/profile-settings-form";

export default async function ProfileSettingsPage() {
  const t = await getTranslations("profile-settings");
  const user = await profile.getProfile();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.description")}</p>
      </div>

      <ProfileSettingsForm user={user} />
    </div>
  );
}
