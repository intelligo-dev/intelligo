"use client";

/**
 * The canvas — a document beside the chat: the one a tool is streaming
 * right now, or one a card reopened. The frame is the T3 artifact
 * part; the body is the kind's own component from
 * `lib/chat-canvas-config.tsx`; versions come from the documents
 * table, and an edit saves as a new version.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ExternalLinkIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ui/ai-artifact";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Link } from "@/i18n/navigation";
import { resolveCanvasKind } from "@/lib/chat-canvas-config";
import type { CanvasRef } from "@/lib/chat-renderers";
import { listArtifactVersions, saveArtifactVersion } from "@/actions/chat";

export type CanvasState = CanvasRef & {
  content: string;
  status: "streaming" | "ready" | "error";
};

type Version = { createdAt: string; content: string };

interface ChatCanvasProps {
  canvas: CanvasState;
  onClose: () => void;
  /** Send a message about the document — a kind's toolbar item. */
  onSendMessage: (text: string) => void;
  /** The content changed on disk: a new version was saved. */
  onSaved?: (documentId: string, content: string) => void;
}

export function ChatCanvas({
  canvas,
  onClose,
  onSendMessage,
  onSaved,
}: ChatCanvasProps) {
  const t = useTranslations("chat");
  const tAny = useTranslations();
  const kind = resolveCanvasKind(canvas.kind);
  const Content = kind.content;
  const [versions, setVersions] = useState<Version[]>([]);
  const [versionIndex, setVersionIndex] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const documentId = canvas.documentId;

  // Versions load once the document is settled; a streaming document
  // has none yet, and a reopened one has whatever was saved.
  useEffect(() => {
    setVersions([]);
    setVersionIndex(0);
    setDraft(null);
    if (!documentId || canvas.status === "streaming") return;
    let cancelled = false;
    void listArtifactVersions(documentId).then((result) => {
      if (cancelled || !result.success) return;
      setVersions(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [documentId, canvas.status]);

  const content = useMemo(() => {
    if (draft !== null) return draft;
    if (versionIndex > 0 && versions[versionIndex]) {
      return versions[versionIndex]!.content;
    }
    if (canvas.content) return canvas.content;
    return versions[0]?.content ?? "";
  }, [draft, versionIndex, versions, canvas.content]);

  const isLatest = versionIndex === 0;
  const isReadonly = canvas.status === "streaming" || !isLatest || !documentId;

  function save() {
    if (!documentId || draft === null) return;
    startSaving(async () => {
      const result = await saveArtifactVersion({
        documentId,
        title: canvas.title,
        kind: canvas.kind,
        content: draft,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(t("canvas.saved"));
      onSaved?.(documentId, draft);
      setDraft(null);
      const refreshed = await listArtifactVersions(documentId);
      if (refreshed.success) setVersions(refreshed.data);
      setVersionIndex(0);
    });
  }

  return (
    <Artifact className="h-full rounded-none border-0 border-l">
      <ArtifactHeader className="gap-3">
        <div className="min-w-0">
          <ArtifactTitle className="truncate">{canvas.title}</ArtifactTitle>
          <ArtifactDescription className="flex items-center gap-2 text-xs">
            {canvas.status === "streaming" ? (
              <>
                <Spinner className="size-3" />
                {t("artifactCard.streaming")}
              </>
            ) : draft !== null ? (
              <StatusBadge status="warning" dot>
                {t("canvas.unsavedChanges")}
              </StatusBadge>
            ) : null}
          </ArtifactDescription>
        </div>
        <ArtifactActions>
          {versions.length > 1 ? (
            <Select
              value={String(versionIndex)}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setDraft(null);
                  setVersionIndex(Number(value));
                }
              }}
            >
              <SelectTrigger size="sm" aria-label={t("canvas.version")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((version, index) => (
                  <SelectItem key={version.createdAt} value={String(index)}>
                    {index === 0
                      ? t("canvas.latest")
                      : `${t("canvas.version")} ${versions.length - index}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {kind.actions?.map((action) => (
            <ArtifactAction
              key={action.labelKey}
              label={tAny(action.labelKey)}
              tooltip={tAny(action.labelKey)}
              icon={action.icon}
              onClick={() =>
                void action.onClick({
                  content,
                  title: canvas.title,
                  ...(documentId ? { documentId } : {}),
                })
              }
            />
          ))}
          <CopyButton
            value={content}
            label={t("canvas.copy")}
            copiedLabel={t("actions.copied")}
            onCopyError={() => toast.error(t("actions.copyFailed"))}
            size="icon-sm"
            variant="ghost"
          />
          {documentId ? (
            <ArtifactAction
              label={t("canvas.openInArtifacts")}
              tooltip={t("canvas.openInArtifacts")}
              icon={ExternalLinkIcon}
              render={<Link href="/artifacts" />}
              nativeButton={false}
            />
          ) : null}
          {draft !== null ? (
            <Button
              size="sm"
              type="button"
              onClick={save}
              disabled={isSaving}
              aria-busy={isSaving || undefined}
            >
              {isSaving ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              {t("canvas.save")}
            </Button>
          ) : null}
          <ArtifactClose label={t("canvas.close")} onClick={onClose} />
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent className="min-h-0">
        <Content
          content={content}
          status={canvas.status}
          title={canvas.title}
          isReadonly={isReadonly}
          onChange={isReadonly ? undefined : setDraft}
        />
      </ArtifactContent>
      {kind.toolbar?.length ? (
        <div className="flex flex-wrap gap-2 border-t px-4 py-2">
          {kind.toolbar.map((item) => (
            <Button
              key={item.labelKey}
              size="xs"
              variant="outline"
              type="button"
              onClick={() => onSendMessage(item.message)}
            >
              {tAny(item.labelKey)}
            </Button>
          ))}
        </div>
      ) : null}
    </Artifact>
  );
}
