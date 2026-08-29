"use client";

/**
 * Pending invitations — table of outstanding workspace invitations
 * with a cancel action. Rendered for owner/admin only.
 */

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import type { OrgInvitation } from "@intelligo/auth";

import { cancelInvitation } from "@/actions/team";
import { RoleBadge } from "./role-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

interface PendingInvitationsProps {
  invitations: OrgInvitation[];
}

export function PendingInvitations({ invitations }: PendingInvitationsProps) {
  const t = useTranslations("team-settings");
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function handleCancel(invitationId: string) {
    setBusyId(invitationId);
    startTransition(async () => {
      const result = await cancelInvitation(invitationId);
      if (!result.success) {
        toast.error(result.error);
      } else {
        toast.success(t("pendingInvitations.canceled"));
      }
      setBusyId(null);
    });
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">
        {t("pendingInvitations.heading", { count: invitations.length })}
      </h2>

      {invitations.length === 0 ? (
        <div className="rounded-md border border-dashed px-6 py-10 text-center">
          <p className="text-sm font-medium">{t("pendingInvitations.empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("pendingInvitations.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pendingInvitations.columns.email")}</TableHead>
                <TableHead>{t("pendingInvitations.columns.role")}</TableHead>
                <TableHead className="hidden sm:table-cell">
                  {t("pendingInvitations.columns.status")}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("pendingInvitations.columns.expires")}
                </TableHead>
                <TableHead className="text-right">
                  {t("pendingInvitations.columns.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation) => {
                const isBusy = isPending && busyId === invitation.id;
                const isExpired = new Date(invitation.expiresAt) < new Date();

                return (
                  <TableRow key={invitation.id}>
                    <TableCell className="font-medium">
                      {invitation.email}
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={invitation.role} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {isExpired ? (
                        <span className="text-sm text-destructive">
                          {t("pendingInvitations.expired")}
                        </span>
                      ) : (
                        <span className="text-sm capitalize text-muted-foreground">
                          {invitation.status}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {format.dateTime(new Date(invitation.expiresAt), {
                        dateStyle: "medium",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancel(invitation.id)}
                        disabled={isBusy}
                      >
                        {isBusy
                          ? t("pendingInvitations.cancelPending")
                          : t("pendingInvitations.cancel")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
