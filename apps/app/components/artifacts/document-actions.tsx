"use client";

/**
 * DocumentActions — per-artifact action cluster: copy full content to
 * the clipboard, and delete (with a confirm dialog whose copy matches
 * what `deleteLatestVersion` (`@/actions/documents`) actually does — see
 * that file's module doc comment for the underlying semantics: this can
 * revert an artifact to an earlier saved version rather than remove it
 * outright, and it refuses artifacts older than 30 days).
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  documentKindExtension,
  fileNameOf,
} from "@/components/ui/document-viewer";
import { Spinner } from "@/components/ui/spinner";

import { deleteLatestVersion } from "@/actions/documents";

interface DocumentActionsProps {
  documentId: string;
  title: string;
  kind: string;
  content: string | null;
  createdAt: string;
  /** Called after a successful delete, e.g. to drop the item from local state. */
  onDeleted?: () => void;
  buttonClassName?: string;
}

export function DocumentActions({
  documentId,
  title,
  kind,
  content,
  createdAt,
  onDeleted,
  buttonClassName,
}: DocumentActionsProps) {
  const t = useTranslations("artifacts");
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, startDeleting] = useTransition();

  /**
   * Saved the way the canvas saves it: an image is already a URL, and
   * everything else becomes a blob typed by its kind, so a sheet lands
   * as a `.csv` a spreadsheet will open rather than as plain text.
   */
  function handleDownload() {
    if (!content) return;
    const link = document.createElement("a");
    if (kind === "image") {
      link.href = content;
    } else {
      link.href = URL.createObjectURL(
        new Blob([content], {
          type: kind === "sheet" ? "text/csv" : "text/plain",
        })
      );
    }
    link.download = fileNameOf(title, documentKindExtension(kind));
    link.click();
    if (link.href.startsWith("blob:")) URL.revokeObjectURL(link.href);
  }

  async function handleCopy() {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success(t("documentActions.copySuccess"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("documentActions.copyErrorTitle"), {
        description: t("documentActions.copyErrorDescription"),
      });
    }
  }

  function handleDelete() {
    startDeleting(async () => {
      const result = await deleteLatestVersion(documentId, createdAt);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(t("documentActions.deleteSuccess"));
      setConfirmOpen(false);
      onDeleted?.();
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1">
      {content && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={(event) => {
            event.stopPropagation();
            void handleCopy();
          }}
          className={buttonClassName}
          title={
            copied
              ? t("documentActions.copyTooltipCopied")
              : t("documentActions.copyTooltipDefault")
          }
        >
          {copied ? (
            <Check className="size-4 text-success" />
          ) : (
            <Copy className="size-4" />
          )}
        </Button>
      )}

      {content && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={(event) => {
            event.stopPropagation();
            handleDownload();
          }}
          className={buttonClassName}
          title={t("documentActions.downloadTooltip")}
        >
          <Download className="size-4" />
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={(event) => {
          event.stopPropagation();
          setConfirmOpen(true);
        }}
        className={buttonClassName}
        title={t("documentActions.deleteTooltip")}
      >
        <Trash2 className="size-4" />
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t("documentActions.deleteDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("documentActions.deleteDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isDeleting}
            >
              {t("documentActions.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? <Spinner /> : t("documentActions.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
