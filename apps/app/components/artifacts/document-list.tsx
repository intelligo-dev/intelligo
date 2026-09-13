"use client";

/**
 * DocumentList — client component that renders the artifact grid with
 * type-based filtering and a full-content preview dialog.
 *
 * Generalizes the first product's `document-list.tsx`: the "Reports"
 * filter is `doc.isReport`, computed server-side in `@/actions/documents`
 * from `@intelligo-dev/core/documents`'s classifier registry — not a
 * hardcoded title-pattern match — and the kind tabs are derived
 * from whatever `kind` values are actually present in the data, so a
 * product that saves a custom kind beyond text/code/sheet/image still
 * gets a working filter tab for it, with no changes to this file.
 *
 * Delete is optimistic-local: `document-actions.tsx` calls the server
 * action itself, and this component only removes the item from its own
 * state on success (the same uncontrolled-list pattern the
 * `notifications` and `team-settings` items use) — no full page
 * `router.refresh()` round trip needed to see the item disappear.
 */

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Bot, Code, File, FileText, ImageIcon, Sheet } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { ArtifactListItem } from "@/actions/documents";
import { DocumentActions } from "./document-actions";

function kindIcon(kind: string) {
  switch (kind) {
    case "code":
      return <Code className="size-4 shrink-0" />;
    case "sheet":
      return <Sheet className="size-4 shrink-0" />;
    case "image":
      return <ImageIcon className="size-4 shrink-0" />;
    default:
      return <FileText className="size-4 shrink-0" />;
  }
}

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

export function DocumentList({ documents }: DocumentListProps) {
  const t = useTranslations("artifacts");
  const [items, setItems] = useState(documents);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /**
   * A known kind (text/code/sheet/image) resolves through this item's
   * own messages; a product-defined custom kind (see the module doc
   * comment above) falls back to capitalizing the raw value — `t.has`
   * is the check next-intl exposes for "does this key exist" without
   * throwing.
   */
  function kindLabel(kind: string): string {
    const key = `filters.kind.${kind}`;
    return t.has(key) ? t(key) : kind.charAt(0).toUpperCase() + kind.slice(1);
  }

  // A kind is a category, not a status: every kind reads the same, and a
  // report — the one kind that means something extra — stands out as secondary.
  function badgeFor(doc: ArtifactListItem): {
    label: string;
    variant: "secondary" | "outline";
  } {
    if (doc.isReport) {
      return { label: t("badge.report"), variant: "secondary" };
    }
    return { label: kindLabel(doc.kind), variant: "outline" };
  }

  const kinds = useMemo(
    () => Array.from(new Set(items.map((doc) => doc.kind))).sort(),
    [items]
  );
  const hasReports = items.some((doc) => doc.isReport);
  const selected = items.find((doc) => doc.id === selectedId) ?? null;

  const filters: { type: string; label: string }[] = [
    { type: "all", label: t("filters.all") },
    ...(hasReports ? [{ type: "report", label: t("filters.reports") }] : []),
    ...kinds.map((kind) => ({ type: kind, label: kindLabel(kind) })),
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

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Button
            key={filter.type}
            type="button"
            variant={activeFilter === filter.type ? "default" : "outline"}
            size="sm"
            className="h-8 rounded-full px-4 text-sm"
            onClick={() => setActiveFilter(filter.type)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <FilteredEmptyState filterLabel={activeFilterLabel} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => {
            const { label, variant } = badgeFor(doc);
            return (
              <Card
                key={doc.id}
                className="group cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => setSelectedId(doc.id)}
              >
                <CardContent className="p-5">
                  <div className="mb-3 flex items-start gap-3">
                    <div className="mt-0.5 text-muted-foreground">
                      {kindIcon(doc.kind)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 line-clamp-2 text-sm font-medium leading-tight">
                        {doc.title}
                      </p>
                      <Badge variant={variant}>{label}</Badge>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <Bot className="size-3 shrink-0" />
                      <span className="truncate">{doc.agentLabel}</span>
                      <span className="shrink-0">·</span>
                      <span className="shrink-0">
                        <RelativeTime iso={doc.createdAt} />
                      </span>
                    </div>

                    <DocumentActions
                      documentId={doc.id}
                      content={doc.content}
                      createdAt={doc.createdAt}
                      onDeleted={() => handleDeleted(doc.id)}
                      buttonClassName="size-7 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
      >
        {selected && (
          <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col">
            <DialogHeader>
              <div className="flex items-start gap-3 pr-8">
                <div className="mt-1 text-muted-foreground">
                  {kindIcon(selected.kind)}
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-left leading-tight">
                    {selected.title}
                  </DialogTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selected.agentLabel} ·{" "}
                    <RelativeTime iso={selected.createdAt} />
                  </p>
                </div>
                <DocumentActions
                  documentId={selected.id}
                  content={selected.content}
                  createdAt={selected.createdAt}
                  onDeleted={() => handleDeleted(selected.id)}
                />
              </div>
            </DialogHeader>

            <ScrollArea className="mt-4 flex-1">
              {selected.content ? (
                <div className="whitespace-pre-wrap px-1 text-sm leading-relaxed">
                  {selected.content}
                </div>
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
