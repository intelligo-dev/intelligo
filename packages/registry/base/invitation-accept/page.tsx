/**
 * Accept invitation page.
 *
 * Server component: loads the caller's own invitation by id via the
 * bound team service (`@/lib/team`, installed by the `team-settings`
 * registry item) and renders one of three reachable states.
 *
 * A note on state coverage: `team.getUserInvitations()` is the only
 * read this item's dependency (the team service in `@intelligo-dev/auth`)
 * exposes for this page. It wraps Better-Auth's
 * `/organization/list-user-invitations` endpoint, which the
 * organization plugin pre-filters to `status === "pending"` before it
 * ever reaches the service. That means an invitation id that does not
 * turn up in the list is indistinguishable, from here, between "never
 * existed", "belongs to a different account", and "already
 * accepted/declined/canceled elsewhere" — there is no by-id read on
 * the service that surfaces a non-pending invitation's status. The
 * "Invitation unavailable" state below covers all three honestly
 * rather than fabricating a distinction the data cannot support.
 * "Expired" IS reliably reachable: the endpoint filters on `status`,
 * not on `expiresAt`, so a past-due invitation still comes back in the
 * list and this page compares the timestamp itself.
 */

import { getFormatter, getTranslations } from "next-intl/server";

import { requireAuth } from "@intelligo-dev/auth";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RoleBadge } from "@/components/team/role-badge";
import { InvitationActions } from "@/components/invitation/invitation-actions";
import { team } from "@/lib/team";

interface Props {
  params: Promise<{ id: string }>;
}

function StatusCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{description}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function AcceptInvitationPage({ params }: Props) {
  const t = await getTranslations("invitation-accept");
  const format = await getFormatter();
  await requireAuth();
  const { id } = await params;

  const invitations = await team.getUserInvitations();
  const invitation = invitations.find((inv) => inv.id === id);

  if (!invitation) {
    return (
      <StatusCard
        title={t("unavailable.title")}
        description={t("unavailable.description")}
      />
    );
  }

  const isExpired = new Date(invitation.expiresAt) < new Date();

  if (isExpired) {
    return (
      <StatusCard
        title={t("expired.title")}
        description={t("expired.description")}
      />
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("card.title")}</CardTitle>
          <CardDescription>{t("card.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("card.workspaceLabel")}
              </p>
              <p className="text-base font-semibold">
                {invitation.organizationName ?? t("card.workspaceFallback")}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("card.invitedByLabel")}
              </p>
              <p className="text-base">
                {invitation.inviterEmail ?? t("card.invitedByFallback")}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("card.roleLabel")}
              </p>
              <div className="mt-1">
                <RoleBadge role={invitation.role} />
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("card.expiresLabel")}
              </p>
              <p className="text-base">
                {format.dateTime(new Date(invitation.expiresAt), {
                  dateStyle: "medium",
                })}
              </p>
            </div>
          </div>

          <InvitationActions invitationId={invitation.id} />
        </CardContent>
      </Card>
    </div>
  );
}
