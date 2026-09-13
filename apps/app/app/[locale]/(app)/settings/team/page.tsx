import { getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo-dev/auth";

import { team } from "@/lib/team";
import { InviteMemberForm } from "@/components/team/invite-member-form";
import { MemberList } from "@/components/team/member-list";
import { PendingInvitations } from "@/components/team/pending-invitations";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";

export default async function TeamSettingsPage() {
  const t = await getTranslations("team-settings");
  const { user, workspace, membership } = await requireWorkspace();
  const canManage = ["owner", "admin"].includes(membership.role);

  const [members, invitations] = await Promise.all([
    team.listMembers(),
    canManage ? team.listInvitations() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle level={2}>{t("page.title")}</PageHeaderTitle>
          <PageHeaderDescription>
            {canManage
              ? t("page.descriptionManage", { workspace: workspace.name })
              : t("page.descriptionReadOnly", { workspace: workspace.name })}
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      {canManage && <InviteMemberForm />}

      <MemberList
        members={members}
        currentUserId={user.id}
        canManage={canManage}
      />

      {canManage && <PendingInvitations invitations={invitations} />}
    </div>
  );
}
