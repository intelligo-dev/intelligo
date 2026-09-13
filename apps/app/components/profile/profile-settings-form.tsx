"use client";

/**
 * Profile settings form — name editor, read-only email, and an
 * account-deletion danger zone.
 *
 * The delete dialog requires typing DELETE to confirm (judgment call,
 * page-migration-manifest.md profile-settings row: account deletion is
 * a higher-stakes, irreversible action than workspace deletion — which
 * `workspace-settings` gates with a plain confirm dialog — so this item
 * adds a typed confirmation on top, the common SaaS pattern).
 *
 * `DELETE_CONFIRMATION` is a stable, non-translated confirmation token
 * (ADR-0010 batch-3 judgment call, this component): the user always
 * types the literal string "DELETE" regardless of locale, so the
 * sentence around it is translated but the token itself is not a
 * message key.
 */

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation";
import { updateProfile, deleteAccount } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const DELETE_CONFIRMATION = "DELETE";

interface ProfileSettingsFormProps {
  user: {
    name: string | null;
    email: string;
    image?: string | null;
  };
}

function initialFrom(user: ProfileSettingsFormProps["user"]): string {
  const source = user.name || user.email;
  return source.charAt(0).toUpperCase();
}

export function ProfileSettingsForm({ user }: ProfileSettingsFormProps) {
  const t = useTranslations("profile-settings");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(user.name ?? "");
  const [error, setError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await updateProfile({ name });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(t("form.updated"));
      router.refresh();
    });
  }

  function handleDelete() {
    if (confirmText !== DELETE_CONFIRMATION) return;

    setIsDeleting(true);
    startTransition(async () => {
      const result = await deleteAccount();
      if (!result.success) {
        toast.error(result.error);
        setIsDeleting(false);
        return;
      }
      toast.success(t("dangerZone.deleted"));
      router.push("/login");
      router.refresh();
    });
  }

  function resetDeleteDialog(open: boolean) {
    setDeleteOpen(open);
    if (!open) {
      setConfirmText("");
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("form.generalTitle")}</CardTitle>
          <CardDescription>{t("form.generalDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
                {initialFrom(user)}
              </div>
              <p className="text-sm text-muted-foreground">
                {t("form.avatarCaption")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">{t("form.nameLabel")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isPending}
                required
                minLength={2}
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t("form.emailLabel")}</Label>
              <Input id="email" value={user.email} disabled />
              <p className="text-xs text-muted-foreground">
                {t("form.emailNote")}
              </p>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? t("form.savePending") : t("form.save")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">
            {t("dangerZone.title")}
          </CardTitle>
          <CardDescription>{t("dangerZone.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={deleteOpen} onOpenChange={resetDeleteDialog}>
            <DialogTrigger render={<Button variant="destructive" />}>
              {t("dangerZone.trigger")}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("dangerZone.dialogTitle")}</DialogTitle>
                <DialogDescription>
                  {t.rich("dangerZone.dialogDescription", {
                    token: () => (
                      <span className="font-mono font-semibold">
                        {DELETE_CONFIRMATION}
                      </span>
                    ),
                  })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label htmlFor="confirm-delete" className="sr-only">
                  {t("dangerZone.confirmLabel", {
                    token: DELETE_CONFIRMATION,
                  })}
                </Label>
                <Input
                  id="confirm-delete"
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  placeholder={DELETE_CONFIRMATION}
                  disabled={isDeleting}
                  autoComplete="off"
                />
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => resetDeleteDialog(false)}
                  disabled={isDeleting}
                >
                  {t("dangerZone.cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isDeleting || confirmText !== DELETE_CONFIRMATION}
                >
                  {isDeleting
                    ? t("dangerZone.confirmPending")
                    : t("dangerZone.confirm")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </>
  );
}
