"use client";

/**
 * A document in the transcript: the kind's glyph, its title, what it
 * is ("Code · py"), and — while it is being written — the last lines
 * arriving under a fade. The whole card opens the document in the
 * canvas, or on the artifacts page where there is no canvas.
 *
 * The streamed text reaches a card two ways: a tool's own input as the
 * model writes it (`saveArtifact`), or the canvas's live content for a
 * document `createArtifactWriter` streams, which `ChatWorkspace`
 * shares through `ArtifactStreamProvider`.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { ChevronRightIcon, FileTextIcon } from "lucide-react";

import { ShimmerText } from "@ui/components/ui/ai-shimmer-text";
import { Link } from "@ui/i18n/navigation";
import { extensionOf, resolveCanvasKind } from "@ui/lib/chat-canvas-config";
import { cn } from "@ui/lib/utils";

type ArtifactStream = { id: string; content: string } | null;

const ArtifactStreamContext = createContext<ArtifactStream>(null);

/** Shares the document streaming into the canvas with its card in the transcript. */
export function ArtifactStreamProvider({
  value,
  children,
}: {
  value: ArtifactStream;
  children: ReactNode;
}) {
  return (
    <ArtifactStreamContext.Provider value={value}>
      {children}
    </ArtifactStreamContext.Provider>
  );
}

/** The streamed content of the document with this id, while it streams. */
export function useArtifactStream(id: string | undefined): string | undefined {
  const stream = useContext(ArtifactStreamContext);
  return id && stream?.id === id ? stream.content : undefined;
}

/** The lines shown under a card while the document is written. */
const PREVIEW_LINES = 4;

function tail(text: string): string {
  return text.trimEnd().split("\n").slice(-PREVIEW_LINES).join("\n");
}

/** Alpha-only: the older lines fade out above the newest. */
const PREVIEW_MASK = "linear-gradient(to bottom, transparent, black 70%)";

export interface ArtifactCardProps {
  title: string;
  kind: string;
  status: "streaming" | "ready" | "error";
  error?: string;
  /** The document's text so far, for the live preview while it streams. */
  preview?: string;
  /** Opens the document — the canvas. */
  onOpen?: () => void;
  /** Where the document lives when there is no canvas to open it in. */
  href?: string;
  className?: string;
}

export function ArtifactCard({
  title,
  kind: kindName,
  status,
  error,
  preview,
  onOpen,
  href,
  className,
}: ArtifactCardProps) {
  const t = useTranslations("chat");
  const tAny = useTranslations();
  const kind = resolveCanvasKind(kindName);
  const Icon = kind.icon ?? FileTextIcon;
  const extension = kindName === "code" ? extensionOf(title) : undefined;
  const interactive = Boolean(onOpen || href);
  const previewText = status === "streaming" && preview ? tail(preview) : "";

  const subtitle =
    status === "streaming" ? (
      <ShimmerText role={undefined}>{t("artifactCard.streaming")}</ShimmerText>
    ) : status === "error" ? (
      (error ?? t("artifactCard.failed"))
    ) : (
      [kind.labelKey ? tAny(kind.labelKey) : null, extension]
        .filter(Boolean)
        .join(" · ")
    );

  const content = (
    <>
      <span className="flex min-w-0 items-center gap-3 p-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
        >
          <Icon className="size-5" />
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-sm leading-5 font-medium text-foreground">
            {title}
          </span>
          <span
            className={cn(
              "truncate text-xs leading-4 text-muted-foreground",
              status === "error" && "text-destructive"
            )}
          >
            {subtitle}
          </span>
        </span>
        {interactive ? (
          <ChevronRightIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/artifact:translate-x-0.5"
          />
        ) : null}
      </span>
      {previewText ? (
        <span
          aria-hidden="true"
          className="block max-h-20 overflow-hidden border-t px-3 py-2 font-mono text-xs leading-4 whitespace-pre-wrap text-muted-foreground"
          style={{ maskImage: PREVIEW_MASK, WebkitMaskImage: PREVIEW_MASK }}
        >
          {previewText}
        </span>
      ) : null}
    </>
  );

  const classes = cn(
    "group/artifact flex w-full max-w-md flex-col overflow-hidden rounded-xl border bg-card text-left",
    interactive &&
      "outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring",
    className
  );

  if (onOpen) {
    return (
      <button
        type="button"
        data-slot="artifact-card"
        className={classes}
        onClick={onOpen}
      >
        {content}
      </button>
    );
  }
  if (href) {
    return (
      <Link data-slot="artifact-card" href={href} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <div
      data-slot="artifact-card"
      className={classes}
      aria-busy={status === "streaming" || undefined}
    >
      {content}
    </div>
  );
}
