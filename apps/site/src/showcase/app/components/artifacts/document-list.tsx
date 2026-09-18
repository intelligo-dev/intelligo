"use client";

/**
 * The artifact library: a grid of document cards and a reader dialog.
 * Documents render through `@/components/ui/document-viewer`, as in the
 * chat canvas.
 *
 * The "Reports" tab filters on `doc.isReport`, computed server-side from
 * the patterns in `@/lib/document-patterns`; the kind tabs come from the
 * kinds present, so a custom kind gets its own tab. A deleted item is
 * dropped from local state once the server action succeeds.
 */

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { Bot, ExternalLink, File } from "lucide-react";

import { Link } from "@showcase/i18n/navigation";
import { Badge } from "@showcase/components/ui/badge";
import { Button } from "@showcase/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@showcase/components/ui/dialog";
import { ScrollArea } from "@showcase/components/ui/scroll-area";
import {
  DocumentView,
  HtmlPreview,
  documentKindIcon,
  extensionOf,
  isPreviewableTitle,
} from "@showcase/components/ui/document-viewer";
import { AnimatedList, AnimatedListItem } from "@showcase/components/ui/animated-list";

import type { ArtifactListItem } from "@showcase/actions/documents";
import { DocumentActions } from "./document-actions";

/** How much of a document a card shows before it fades out. */
const PREVIEW_LINES = 8;

function head(text: string): string {
  return text.trimStart().split("\n").slice(0, PREVIEW_LINES).join("\n");
}

/**
 * An inline style rather than a class, because the design system keeps
 * gradients out of class names. It fades the bottom: a card shows a
 * document's opening lines.
 */
const PREVIEW_MASK = "linear-gradient(to bottom, black 60%, transparent)";

interface DocumentListProps {
  documents: ArtifactListItem[];
}

/**
 * Relative timestamp that can't cause a hydration mismatch: the server
 * (and the first client render) show a locale-formatted absolute date,
 * and an effect swaps in the relative form once mounted — `Date.now()`
 * during render would differ between server and client.
 */
function RelativeTime({ iso }: { iso: string }) {
  const format = useFormatter();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const date = new Date(iso);
  return (
    <>
      {now
        ? format.relativeTime(date, now)
        : format.dateTime(date, { dateStyle: "medium" })}
    </>
  );
}

/** The kind's glyph on the tile both the card and the reader use. */
function KindTile({ kind, large }: { kind: string; large?: boolean }) {
  const Icon = documentKindIcon(kind);
  return (
    <span
      aria-hidden="true"
      className={
        large
          ? "grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
          : "grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
      }
    >
      <Icon className={large ? "size-5" : "size-4"} />
    </span>
  );
}

export function DocumentList({ documents }: DocumentListProps) {
  const t = useTranslations("artifacts");
  const [items, setItems] = useState(documents);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"preview" | "source">("preview");

  // `/artifacts?document=<id>` — the chat canvas's "Open in Artifacts" —
  // lands on that document's preview.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("document");
    if (id) setSelectedId(id);
  }, []);

  // Each document opens on its rendered form, not on whatever the last
  // one was left showing.
  useEffect(() => setView("preview"), [selectedId]);

  /**
   * A known kind (text/code/sheet/image) resolves through this item's
   * own messages; a product-defined custom kind falls back to
   * capitalizing the raw value — `t.has` is the check next-intl exposes
   * for "does this key exist" without throwing.
   */
  function kindLabel(kind: string): string {
    const key = `filters.kind.${kind}`;
    return t.has(key) ? t(key) : kind.charAt(0).toUpperCase() + kind.slice(1);
  }

  /** "Code · py" — the same subtitle the chat's artifact card writes. */
  function subtitleOf(doc: ArtifactListItem): string {
    const extension = doc.kind === "code" ? extensionOf(doc.title) : undefined;
    return [kindLabel(doc.kind), extension].filter(Boolean).join(" · ");
  }

  const kinds = useMemo(
    () => Array.from(new Set(items.map((doc) => doc.kind))).sort(),
    [items]
  );
  const hasReports = items.some((doc) => doc.isReport);
  const selected = items.find((doc) => doc.id === selectedId) ?? null;

  const filters: { type: string; label: string; count: number }[] = [
    { type: "all", label: t("filters.all"), count: items.length },
    ...(hasReports
      ? [
          {
            type: "report",
            label: t("filters.reports"),
            count: items.filter((doc) => doc.isReport).length,
          },
        ]
      : []),
    ...kinds.map((kind) => ({
      type: kind,
      label: kindLabel(kind),
      count: items.filter((doc) => doc.kind === kind).length,
    })),
  ];

  const filtered = items.filter((doc) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "report") return doc.isReport;
    return doc.kind === activeFilter;
  });

  function handleDeleted(id: string) {
    setItems((prev) => prev.filter((doc) => doc.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }

  if (items.length === 0) {
    return <EmptyState />;
  }

  const activeFilterLabel =
    filters.find((filter) => filter.type === activeFilter)?.label ??
    activeFilter;

  // An HTML page or an SVG has a rendered form worth offering; anything
  // else is only ever its source.
  const canPreview = selected ? isPreviewableTitle(selected.title) : false;

  return (
    <>
      {/* One segmented control, not a row of pill buttons: these are
          views of one list, and the counts say what is behind each. */}
      <div
        role="group"
        aria-label={t("filters.all")}
        className="flex w-fit max-w-full flex-wrap items-center gap-0.5 rounded-lg bg-muted p-0.5"
      >
        {filters.map((filter) => {
          const active = activeFilter === filter.type;
          return (
            <button
              key={filter.type}
              type="button"
              aria-pressed={active}
              onClick={() => setActiveFilter(filter.type)}
              className={`h-7 rounded-md px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {filter.label}
              <span className="ml-1.5 tabular-nums opacity-60">
                {filter.count}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <FilteredEmptyState filterLabel={activeFilterLabel} />
      ) : (
        <AnimatedList
          as="div"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {filtered.map((doc) => {
            const previewText = doc.content ? head(doc.content) : "";
            return (
              <AnimatedListItem
                as="div"
                key={doc.id}
                className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/20 focus-within:border-foreground/20"
                onClick={() => setSelectedId(doc.id)}
              >
                {/* The document itself, clipped under a fade. Decorative:
                    the title below is the accessible name. */}
                {doc.kind === "image" && doc.content ? (
                  <div className="h-28 overflow-hidden border-b bg-muted/30">
                    <img
                      src={doc.content}
                      alt=""
                      aria-hidden="true"
                      className="size-full object-cover"
                    />
                  </div>
                ) : previewText ? (
                  <div
                    aria-hidden="true"
                    className="h-28 overflow-hidden border-b bg-muted/30 px-4 pt-3 font-mono text-xs leading-4 whitespace-pre-wrap text-muted-foreground"
                    style={{
                      maskImage: PREVIEW_MASK,
                      WebkitMaskImage: PREVIEW_MASK,
                    }}
                  >
                    {previewText}
                  </div>
                ) : (
                  <div className="grid h-28 place-items-center border-b bg-muted/30">
                    <File
                      aria-hidden="true"
                      className="size-6 text-muted-foreground/40"
                    />
                  </div>
                )}

                <div className="flex min-w-0 items-start gap-3 p-4">
                  <KindTile kind={doc.kind} />
                  <div className="min-w-0 flex-1">
                    {/* A real button, so the card is reachable and
                        named without nesting controls inside it. */}
                    <button
                      type="button"
                      onClick={() => setSelectedId(doc.id)}
                      className="line-clamp-2 text-left text-sm leading-tight font-medium outline-none focus-visible:underline"
                    >
                      {doc.title}
                    </button>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {subtitleOf(doc)}
                    </p>
                    <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <Bot className="size-3 shrink-0" />
                      <span className="truncate">{doc.agentLabel}</span>
                      <span className="shrink-0">·</span>
                      <span className="shrink-0">
                        <RelativeTime iso={doc.createdAt} />
                      </span>
                    </div>
                  </div>

                  {doc.isReport ? (
                    <Badge variant="secondary">{t("badge.report")}</Badge>
                  ) : null}

                  <DocumentActions
                    documentId={doc.id}
                    title={doc.title}
                    kind={doc.kind}
                    content={doc.content}
                    createdAt={doc.createdAt}
                    onDeleted={() => handleDeleted(doc.id)}
                    buttonClassName="size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  />
                </div>
              </AnimatedListItem>
            );
          })}
        </AnimatedList>
      )}

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
      >
        {selected && (
          /* `sm:` matters: DialogContent's base classes include
             `sm:max-w-sm`, which tailwind-merge does not replace with an
             unprefixed `max-w-*`, so that would win above 640px. */
          <DialogContent className="flex max-h-[80vh] w-full flex-col sm:max-w-5xl">
            <DialogHeader>
              <div className="flex items-start gap-3 pr-8">
                <KindTile kind={selected.kind} large />
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-left leading-tight">
                    {selected.title}
                  </DialogTitle>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {subtitleOf(selected)} · {selected.agentLabel} ·{" "}
                    <RelativeTime iso={selected.createdAt} />
                  </p>
                </div>
              </div>

              {/* Second row, as in the chat canvas: how to look at the
                  document, then what to do with it. */}
              <div className="flex min-w-0 flex-wrap items-center gap-2 pt-1">
                {canPreview ? (
                  <div
                    role="group"
                    aria-label={t("preview.view")}
                    className="flex items-center rounded-lg bg-muted p-0.5"
                  >
                    {(["preview", "source"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={view === option}
                        onClick={() => setView(option)}
                        className={`h-6 rounded-md px-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                          view === option
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {option === "preview"
                          ? t("preview.rendered")
                          : t("preview.source")}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="ml-auto flex items-center gap-1">
                  {selected.conversationId ? (
                    <Button
                      size="sm"
                      variant="outline"
                      render={
                        <Link href={`/chat/${selected.conversationId}`} />
                      }
                      nativeButton={false}
                    >
                      <ExternalLink data-icon="inline-start" />
                      {t("preview.openConversation")}
                    </Button>
                  ) : null}
                  <DocumentActions
                    documentId={selected.id}
                    title={selected.title}
                    kind={selected.kind}
                    content={selected.content}
                    createdAt={selected.createdAt}
                    onDeleted={() => handleDeleted(selected.id)}
                  />
                </div>
              </div>
            </DialogHeader>

            {/* `flex flex-col` is what makes this scroll: ScrollArea's
                viewport is `size-full`, and a percentage height against
                a shrunk flex item resolves to `auto`, so a long document
                would run past the dialog. A flex parent sizes it by
                layout instead. */}
            <ScrollArea className="mt-2 flex min-h-0 flex-1 flex-col">
              {selected.content ? (
                canPreview && view === "preview" ? (
                  <HtmlPreview
                    content={selected.content}
                    title={selected.title}
                  />
                ) : (
                  <DocumentView
                    kind={selected.kind}
                    title={selected.title}
                    content={selected.content}
                  />
                )
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  {t("noContent")}
                </p>
              )}
            </ScrollArea>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function EmptyState() {
  const t = useTranslations("artifacts");
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <File className="mb-4 size-12 text-muted-foreground/40" />
      <h3 className="mb-1 text-lg font-semibold">{t("emptyState.title")}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("emptyState.description")}
      </p>
      {/* An empty artifacts page is a dead end without this: nothing
          on it produces an artifact — the chat surface does. */}
      <Button
        size="sm"
        className="mt-4"
        render={<Link href="/chat" />}
        nativeButton={false}
      >
        {t("emptyState.cta")}
      </Button>
    </div>
  );
}

function FilteredEmptyState({ filterLabel }: { filterLabel: string }) {
  const t = useTranslations("artifacts");
  const lowerFilterLabel = filterLabel.toLowerCase();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <File className="mb-4 size-12 text-muted-foreground/40" />
      <h3 className="mb-1 text-lg font-semibold">
        {t("filteredEmptyState.title", { filterLabel: lowerFilterLabel })}
      </h3>
      <p className="text-sm text-muted-foreground">
        {t("filteredEmptyState.description", { filterLabel })}
      </p>
    </div>
  );
}
