"use client";

/**
 * The canvas — a document beside the chat: the one a tool is streaming
 * right now, or one a card reopened. The frame is `ai-artifact`;
 * the body is the kind's own component from
 * `lib/chat-canvas-config.tsx`; versions come from the documents
 * table, and an edit saves as a new version.
 *
 * The header is two quiet rows: what the document is (glyph, title,
 * kind and state) with expand and close, then how to work with it — a
 * preview/code switch for content that renders, the version stepper,
 * copy, download, the artifacts page, restore and save.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "use-intl";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  HistoryIcon,
  Maximize2Icon,
  Minimize2Icon,
  SaveIcon,
} from "lucide-react";
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
} from "@showcase/components/ui/ai-artifact";
import { Button } from "@showcase/components/ui/button";
import { CopyButton } from "@showcase/components/ui/copy-button";
import { Spinner } from "@showcase/components/ui/spinner";
import { Link } from "@showcase/i18n/navigation";
import {
  extensionOf,
  fileNameOf,
  resolveCanvasKind,
} from "@showcase/lib/chat-canvas-config";
import type { CanvasRef } from "@showcase/lib/chat-renderers";
import { cn } from "@showcase/lib/utils";
import { listArtifactVersions, saveArtifactVersion } from "@showcase/actions/chat";

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
  /** The panel fills the page instead of sharing it with the thread. */
  expanded?: boolean;
  /** Offered where the panel can fill the page. */
  onToggleExpand?: () => void;
}

export function ChatCanvas({
  canvas,
  onClose,
  onSendMessage,
  onSaved,
  expanded = false,
  onToggleExpand,
}: ChatCanvasProps) {
  const t = useTranslations("chat");
  const tAny = useTranslations();
  const kind = resolveCanvasKind(canvas.kind);
  const Content = kind.content;
  const Preview = kind.preview;
  const Icon = kind.icon ?? FileTextIcon;
  const [versions, setVersions] = useState<Version[]>([]);
  const [versionIndex, setVersionIndex] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [view, setView] = useState<"preview" | "source">("preview");
  const [isSaving, startSaving] = useTransition();

  const documentId = canvas.documentId;
  const canPreview =
    Boolean(Preview) && (kind.previewable?.(canvas.title) ?? true);

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
  const showPreview =
    canPreview && view === "preview" && canvas.status !== "streaming";

  function selectVersion(index: number) {
    setDraft(null);
    setVersionIndex(index);
  }

  /** An older version becomes the draft of the next one. */
  function restore() {
    const older = versions[versionIndex]?.content;
    if (older === undefined) return;
    setVersionIndex(0);
    setDraft(older);
  }

  function download() {
    const link = document.createElement("a");
    if (canvas.kind === "image") {
      link.href = content;
    } else {
      link.href = URL.createObjectURL(
        new Blob([content], {
          type: canvas.kind === "sheet" ? "text/csv" : "text/plain",
        })
      );
    }
    link.download = fileNameOf(canvas.title, kind);
    link.click();
    if (link.href.startsWith("blob:")) URL.revokeObjectURL(link.href);
  }

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

  const extension =
    canvas.kind === "code" ? extensionOf(canvas.title) : undefined;
  const description =
    canvas.status === "streaming" ? (
      <>
        <Spinner className="size-3" />
        {t("artifactCard.streaming")}
      </>
    ) : draft !== null ? (
      <>
        <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
        {t("canvas.unsavedChanges")}
      </>
    ) : (
      [kind.labelKey ? tAny(kind.labelKey) : null, extension]
        .filter(Boolean)
        .join(" · ")
    );

  return (
    <Artifact className="h-full rounded-none border-0 shadow-none">
      <ArtifactHeader className="flex-col items-stretch gap-1.5 bg-transparent px-3 pt-2.5 pb-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <ArtifactTitle className="truncate leading-5">
              {canvas.title}
            </ArtifactTitle>
            <ArtifactDescription className="flex min-h-4 items-center gap-1.5 truncate text-xs leading-4">
              {description}
            </ArtifactDescription>
          </div>
          {onToggleExpand ? (
            <ArtifactAction
              label={expanded ? t("canvas.collapse") : t("canvas.expand")}
              tooltip={expanded ? t("canvas.collapse") : t("canvas.expand")}
              icon={expanded ? Minimize2Icon : Maximize2Icon}
              onClick={onToggleExpand}
            />
          ) : null}
          <ArtifactClose label={t("canvas.close")} onClick={onClose} />
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {canPreview ? (
            <div
              role="group"
              aria-label={t("canvas.view")}
              className="flex items-center rounded-lg bg-muted p-0.5"
            >
              {(["preview", "source"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={view === option}
                  onClick={() => setView(option)}
                  className={cn(
                    "h-6 rounded-md px-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    view === option && "bg-background text-foreground shadow-xs"
                  )}
                >
                  {option === "preview"
                    ? t("canvas.preview")
                    : t("canvas.source")}
                </button>
              ))}
            </div>
          ) : null}

          {versions.length > 1 ? (
            <div
              role="group"
              aria-label={t("canvas.version")}
              className="flex items-center"
            >
              <ArtifactAction
                label={t("canvas.olderVersion")}
                icon={ChevronLeftIcon}
                disabled={versionIndex >= versions.length - 1}
                onClick={() => selectVersion(versionIndex + 1)}
              />
              <span className="min-w-10 text-center text-xs text-muted-foreground tabular-nums">
                {t("canvas.versionOf", {
                  index: versions.length - versionIndex,
                  count: versions.length,
                })}
              </span>
              <ArtifactAction
                label={t("canvas.newerVersion")}
                icon={ChevronRightIcon}
                disabled={isLatest}
                onClick={() => selectVersion(versionIndex - 1)}
              />
            </div>
          ) : null}

          <ArtifactActions className="ml-auto">
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
            <ArtifactAction
              label={t("canvas.download")}
              tooltip={t("canvas.download")}
              icon={DownloadIcon}
              disabled={!content || canvas.status === "streaming"}
              onClick={download}
            />
            {documentId ? (
              <ArtifactAction
                label={t("canvas.openInArtifacts")}
                tooltip={t("canvas.openInArtifacts")}
                icon={ExternalLinkIcon}
                render={
                  <Link
                    href={`/artifacts?document=${encodeURIComponent(documentId)}`}
                  />
                }
                nativeButton={false}
              />
            ) : null}
            {!isLatest ? (
              <Button
                size="xs"
                variant="outline"
                type="button"
                onClick={restore}
              >
                <HistoryIcon data-icon="inline-start" />
                {t("canvas.restore")}
              </Button>
            ) : null}
            {draft !== null ? (
              <Button
                size="xs"
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
          </ArtifactActions>
        </div>
      </ArtifactHeader>
      <ArtifactContent className={cn("min-h-0", showPreview && "p-3")}>
        {showPreview && Preview ? (
          <Preview
            content={content}
            status={canvas.status}
            title={canvas.title}
            isReadonly
          />
        ) : (
          <Content
            content={content}
            status={canvas.status}
            title={canvas.title}
            isReadonly={isReadonly}
            onChange={isReadonly ? undefined : setDraft}
          />
        )}
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
