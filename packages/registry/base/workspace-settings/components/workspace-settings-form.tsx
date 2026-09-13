"use client";

/**
 * Workspace settings form — name/slug editor plus an owner-only danger
 * zone. Owners and admins can edit; a plain member sees a read-only
 * form. Only an owner sees the delete-workspace control, gated behind
 * a confirmation dialog.
 */

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation";
import { updateWorkspace, deleteWorkspace } from "@/actions/workspace";
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

interface WorkspaceSettingsFormProps {
  workspace: {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
  };
  canEdit: boolean;
  isOwner: boolean;
}

export function WorkspaceSettingsForm({
  workspace,
  canEdit,
  isOwner,
}: WorkspaceSettingsFormProps) {
  const t = useTranslations("workspace-settings");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(workspace.name);
  const [slug, setSlug] = useState(workspace.slug);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await updateWorkspace({ name, slug });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(t("form.updated"));
      router.refresh();
    });
  }

  function handleDelete() {
    setIsDeleting(true);
    startTransition(async () => {
      const result = await deleteWorkspace();
      if (!result.success) {
        toast.error(result.error);
        setIsDeleting(false);
        setDeleteOpen(false);
        return;
      }
      toast.success(t("dangerZone.deleted"));
      router.push("/dashboard");
      router.refresh();
    });
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

            <div className="space-y-2">
              <Label htmlFor="name">{t("form.nameLabel")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canEdit || isPending}
                required
                minLength={2}
                maxLength={50}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">{t("form.urlLabel")}</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                disabled={!canEdit || isPending}
                required
                minLength={2}
                maxLength={50}
                pattern="[a-z0-9-]+"
              />
              <p className="text-xs text-muted-foreground">{workspace.slug}</p>
            </div>

            {canEdit ? (
              <div className="flex justify-end">
                <Button type="submit" disabled={isPending}>
                  {isPending ? t("form.savePending") : t("form.save")}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("form.readOnlyNote")}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">
              {t("dangerZone.title")}
            </CardTitle>
            <CardDescription>{t("dangerZone.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger render={<Button variant="destructive" />}>
                {t("dangerZone.trigger")}
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("dangerZone.dialogTitle")}</DialogTitle>
                  <DialogDescription>
                    {t("dangerZone.dialogDescription", {
                      name: workspace.name,
                    })}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setDeleteOpen(false)}
                    disabled={isDeleting}
                  >
                    {t("dangerZone.cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={isDeleting}
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
      )}
    </>
  );
}
