/**
 * Team settings page — server component.
 *
 * Loads the caller's workspace membership, then renders an invite
 * form (owner/admin only), the member list, and pending invitations.
 * A "member" role gets a read-only view: no invite form, no pending
 * invitations, no role/remove controls.
 */

import { getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo-dev/auth";

import { team } from "@/lib/team";
import { InviteMemberForm } from "@/components/team/invite-member-form";
import { MemberList } from "@/components/team/member-list";
import { PendingInvitations } from "@/components/team/pending-invitations";

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
      <div>
        <h1 className="text-lg font-semibold">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {canManage
            ? t("page.descriptionManage", { workspace: workspace.name })
            : t("page.descriptionReadOnly", { workspace: workspace.name })}
        </p>
      </div>

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
