/**
 * A `member` gets a read-only view of the same form; only an owner sees
 * the danger zone.
 */

import { getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo-dev/auth";

import { WorkspaceSettingsForm } from "@/components/workspace/workspace-settings-form";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";

export default async function WorkspaceSettingsPage() {
  const t = await getTranslations("workspace-settings");
  const { workspace, membership } = await requireWorkspace();

  const canEdit = membership.role === "owner" || membership.role === "admin";
  const isOwner = membership.role === "owner";

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle level={2}>{t("page.title")}</PageHeaderTitle>
          <PageHeaderDescription>{t("page.description")}</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <WorkspaceSettingsForm
        workspace={workspace}
        canEdit={canEdit}
        isOwner={isOwner}
      />
    </div>
  );
}
