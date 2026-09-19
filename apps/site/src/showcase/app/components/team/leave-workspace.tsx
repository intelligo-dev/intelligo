"use client";

/**
 * Leave workspace — every role can leave. The sole owner cannot: the
 * service refuses and the message says to make someone else an owner
 * first.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "use-intl";
import { toast } from "sonner";

import { useRouter } from "@showcase/i18n/navigation";
import { leaveWorkspace } from "@showcase/actions/team";
import { Button } from "@showcase/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@showcase/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@showcase/components/ui/alert-dialog";

interface LeaveWorkspaceProps {
  workspaceName: string;
}

export function LeaveWorkspace({ workspaceName }: LeaveWorkspaceProps) {
  const t = useTranslations("team-settings");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleLeave() {
    startTransition(async () => {
      const result = await leaveWorkspace();
      if (!result.success) {
        toast.error(result.error);
        setOpen(false);
        return;
      }
      toast.success(t("leave.left", { workspace: workspaceName }));
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle>{t("leave.title")}</CardTitle>
        <CardDescription>
          {t("leave.description", { workspace: workspaceName })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* A request in flight keeps the dialog open until it settles. */}
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            if (!isPending) setOpen(next);
          }}
        >
          <AlertDialogTrigger render={<Button variant="destructive" />}>
            {t("leave.trigger")}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("leave.dialogTitle", { workspace: workspaceName })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("leave.dialogDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>
                {t("leave.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={handleLeave}
                disabled={isPending}
                aria-busy={isPending}
              >
                {isPending ? t("leave.confirmPending") : t("leave.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
