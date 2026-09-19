"use client";

/**
 * Member list — table of workspace members with role changes and
 * removal. Owner/admin only for the management controls; anyone else
 * sees a read-only table. An owner can also make another member an
 * owner, behind a confirmation.
 */

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { toast } from "sonner";

import type { OrgMember } from "@intelligo-dev/auth";

import {
  removeMember,
  transferOwnership,
  updateMemberRole,
} from "@showcase/actions/team";
import { RoleBadge } from "./role-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@showcase/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@showcase/components/ui/select";
import { Button } from "@showcase/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@showcase/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@showcase/components/ui/dialog";

/**
 * `getFullOrganization()` returns a richer member record than the
 * `OrgMember` type declared in `@intelligo-dev/auth` (documented there as
 * the "minimal" shape: `id`, `userId`, `role`) — Better-Auth also
 * joins the `user` record and a `createdAt` timestamp onto each
 * member. Both are declared optional here so the table still renders
 * (falling back to the member id) if a future version omits them.
 */
export type TeamMember = OrgMember & {
  user?: { name?: string | null; email?: string | null } | null;
  createdAt?: string | Date;
};

interface MemberListProps {
  members: TeamMember[];
  currentUserId: string;
  canManage: boolean;
  /** Owners only: shows "Make owner" on every other non-owner member. */
  canTransfer?: boolean;
}

export function MemberList({
  members,
  currentUserId,
  canManage,
  canTransfer = false,
}: MemberListProps) {
  const t = useTranslations("team-settings");
  // The labels SelectValue shows; Base UI renders the raw value without them.
  const roleItems = [
    { value: "member", label: t("roles.member") },
    { value: "admin", label: t("roles.admin") },
  ];
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  // The target outlives `transferOpen` so the name stays while the dialog exits.
  const [transferTarget, setTransferTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const isTransferring =
    isPending && transferTarget !== null && busyId === transferTarget.id;

  function handleRoleChange(memberId: string, role: string) {
    setBusyId(memberId);
    startTransition(async () => {
      const result = await updateMemberRole({
        memberId,
        role: role as "admin" | "member",
      });
      if (!result.success) {
        toast.error(result.error);
      } else {
        toast.success(t("memberList.roleUpdated"));
      }
      setBusyId(null);
    });
  }

  function handleRemove(memberId: string, name: string) {
    setBusyId(memberId);
    startTransition(async () => {
      const result = await removeMember(memberId);
      if (!result.success) {
        toast.error(result.error);
      } else {
        toast.success(t("memberList.memberRemoved", { name }));
      }
      setBusyId(null);
    });
  }

  function handleTransfer() {
    if (!transferTarget) return;
    const { id, name } = transferTarget;
    setBusyId(id);
    startTransition(async () => {
      const result = await transferOwnership(id);
      if (!result.success) {
        toast.error(result.error);
      } else {
        toast.success(t("memberList.ownershipTransferred", { name }));
      }
      setBusyId(null);
      setTransferOpen(false);
    });
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">
        {t("memberList.heading", { count: members.length })}
      </h2>

      {members.length === 0 ? (
        <div className="rounded-md border border-dashed px-6 py-10 text-center">
          <p className="text-sm font-medium">{t("memberList.empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("memberList.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("memberList.columns.name")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("memberList.columns.email")}
                </TableHead>
                <TableHead>{t("memberList.columns.role")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("memberList.columns.joined")}
                </TableHead>
                {canManage && (
                  <TableHead className="text-right">
                    {t("memberList.columns.actions")}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const memberId = member.id ?? member.userId;
                const isCurrentUser = member.userId === currentUserId;
                const isOwner = member.role === "owner";
                const isBusy = isPending && busyId === memberId;
                const name = member.user?.name || member.userId;

                return (
                  <TableRow key={memberId}>
                    <TableCell className="font-medium">
                      {name}
                      {isCurrentUser && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t("memberList.you")}
                        </span>
                      )}
                      {/* The email column is hidden on small screens,
                          so the primary cell carries it there. */}
                      <span className="block truncate text-xs font-normal text-muted-foreground md:hidden">
                        {member.user?.email ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {member.user?.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      {canManage && !isOwner && !isCurrentUser ? (
                        <Select
                          value={member.role}
                          items={roleItems}
                          onValueChange={(value) =>
                            value && handleRoleChange(memberId, value)
                          }
                          disabled={isBusy}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">
                              {t("roles.member")}
                            </SelectItem>
                            <SelectItem value="admin">
                              {t("roles.admin")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <RoleBadge role={member.role} />
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {member.createdAt
                        ? format.dateTime(new Date(member.createdAt), {
                            dateStyle: "medium",
                          })
                        : "—"}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {canTransfer && !isOwner && !isCurrentUser && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => {
                              setTransferTarget({ id: memberId, name });
                              setTransferOpen(true);
                            }}
                          >
                            {t("memberList.transferDialog.trigger")}
                          </Button>
                        )}
                        {!isCurrentUser && !isOwner && (
                          <Dialog>
                            <DialogTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isBusy}
                                />
                              }
                            >
                              {t("memberList.removeDialog.trigger")}
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>
                                  {t("memberList.removeDialog.title")}
                                </DialogTitle>
                                <DialogDescription>
                                  {t("memberList.removeDialog.description", {
                                    name,
                                  })}
                                </DialogDescription>
                              </DialogHeader>
                              <DialogFooter>
                                <Button
                                  variant="destructive"
                                  onClick={() => handleRemove(memberId, name)}
                                  disabled={isBusy}
                                >
                                  {isBusy
                                    ? t(
                                        "memberList.removeDialog.confirmPending"
                                      )
                                    : t("memberList.removeDialog.confirm")}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* A request in flight keeps the dialog open until it settles. */}
      <AlertDialog
        open={transferOpen}
        onOpenChange={(next) => {
          if (!isTransferring) setTransferOpen(next);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("memberList.transferDialog.title", {
                name: transferTarget?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("memberList.transferDialog.description", {
                name: transferTarget?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTransferring}>
              {t("memberList.transferDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTransfer}
              disabled={isTransferring}
              aria-busy={isTransferring}
            >
              {isTransferring
                ? t("memberList.transferDialog.confirmPending")
                : t("memberList.transferDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
