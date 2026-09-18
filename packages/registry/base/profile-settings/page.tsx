/**
 * No workspace or role gating: a profile belongs to the user, not to
 * any one workspace.
 */

import { getTranslations } from "next-intl/server";

import { profile } from "@/lib/profile";
import { ProfileSettingsForm } from "@/components/profile/profile-settings-form";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";

export default async function ProfileSettingsPage() {
  const t = await getTranslations("profile-settings");
  const user = await profile.getProfile();

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle level={2}>{t("page.title")}</PageHeaderTitle>
          <PageHeaderDescription>{t("page.description")}</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <ProfileSettingsForm user={user} />
    </div>
  );
}
