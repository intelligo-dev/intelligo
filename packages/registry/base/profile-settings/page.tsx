/**
 * Profile settings page — server component.
 *
 * Loads the caller's own profile and renders the name/email editor
 * plus the account-deletion danger zone. No workspace/role gating: a
 * profile belongs to the user, not to any one workspace.
 *
 * Judgment note (page-migration-manifest.md, profile-settings row):
 * the first product mounts this content at the `/settings` root (its "profile"
 * tab has no dedicated sub-route). This generic item ships its own
 * `/settings/profile` route instead, matching the sibling
 * `team-settings`/`workspace-settings` items' `/settings/<item>`
 * convention rather than special-casing the settings root for one tab.
 */

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
