"use client";

/**
 * Publish a conversation as a read-only page anyone with the link can
 * open, and stop sharing it again. What the page shows is decided
 * server-side (`sanitizeForShare` in `@intelligo-dev/chat`): the
 * reader's reasoning, tool details and attachments never leave.
 */

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Share2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { getShareState, setConversationShared } from "@/actions/chat";

interface ShareDialogProps {
  conversationId: string;
}

export function ShareDialog({ conversationId }: ShareDialogProps) {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);
  const [shared, setShared] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    void getShareState(conversationId).then((result) => {
      setShared(result.success ? result.data.shared : false);
    });
  }, [open, conversationId]);

  const url =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/share/${conversationId}`;

  function toggle(next: boolean) {
    startTransition(async () => {
      const result = await setConversationShared(conversationId, next);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setShared(next);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={t("header.share")}
          />
        }
      >
        <Share2Icon />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("share.title")}</DialogTitle>
          <DialogDescription>{t("share.description")}</DialogDescription>
        </DialogHeader>
        {shared === null ? (
          <Spinner />
        ) : shared ? (
          <div className="flex items-center gap-2">
            <Input readOnly value={url} aria-label={t("share.copyLink")} />
            <CopyButton
              value={url}
              label={t("share.copyLink")}
              copiedLabel={t("share.linkCopied")}
              onCopyError={() => toast.error(t("actions.copyFailed"))}
              size="sm"
              variant="outline"
            >
              {t("share.copyLink")}
            </CopyButton>
          </div>
        ) : null}
        <DialogFooter>
          {shared ? (
            <Button
              variant="outline"
              type="button"
              disabled={isPending}
              aria-busy={isPending || undefined}
              onClick={() => toggle(false)}
            >
              {isPending ? <Spinner data-icon="inline-start" /> : null}
              {t("share.disable")}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={isPending || shared === null}
              aria-busy={isPending || undefined}
              onClick={() => toggle(true)}
            >
              {isPending ? <Spinner data-icon="inline-start" /> : null}
              {t("share.enable")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
