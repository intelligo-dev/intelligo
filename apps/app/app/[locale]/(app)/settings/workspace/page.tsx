import { getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo-dev/auth";

import { WorkspaceSettingsForm } from "@/components/workspace/workspace-settings-form";

export default async function WorkspaceSettingsPage() {
  const t = await getTranslations("workspace-settings");
  const { workspace, membership } = await requireWorkspace();

  const canEdit = membership.role === "owner" || membership.role === "admin";
  const isOwner = membership.role === "owner";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.description")}</p>
      </div>

      <WorkspaceSettingsForm
        workspace={workspace}
        canEdit={canEdit}
        isOwner={isOwner}
      />
    </div>
  );
}
