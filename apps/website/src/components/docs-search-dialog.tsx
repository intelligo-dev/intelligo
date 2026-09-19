import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { SearchIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The search dialog: every docs page, and every h2/h3 on it, from the
 * index the build writes to /docs/search.json. The trigger in the nav
 * loads this file the first time it opens, and the index is fetched
 * then too, so a page that is never searched pays for neither.
 */

type Row = {
  href: string;
  title: string;
  section: string;
  description: string;
  headings: { slug: string; text: string }[];
};

/**
 * cmdk's own scorer is fuzzy over the whole value: against a sentence-long
 * description nearly any word "matches", and the best hit for `artifact`
 * was the first page. Here every word typed has to be in the entry, and a
 * hit in the title or heading outranks one in the description.
 */
function score(value: string, search: string, keywords?: string[]): number {
  const name = value.toLowerCase();
  const rest = (keywords ?? []).join(" ").toLowerCase();
  let total = 0;
  for (const word of search.toLowerCase().split(/\s+/).filter(Boolean)) {
    if (name.startsWith(word)) total += 1;
    else if (name.includes(word)) total += 0.7;
    else if (rest.includes(word)) total += 0.2;
    else return 0;
  }
  return total;
}

export default function DocsSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || rows) return;
    fetch("/docs/search.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((data: Row[]) => setRows(data))
      .catch(() => setFailed(true));
  }, [open, rows]);

  const sections = useMemo(() => {
    const by = new Map<string, Row[]>();
    for (const r of rows ?? [])
      by.set(r.section, [...(by.get(r.section) ?? []), r]);
    return [...by.entries()];
  }, [rows]);

  const go = (href: string) => {
    onOpenChange(false);
    location.assign(href);
  };

  const item =
    "flex cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2 text-[0.9rem] text-foreground/80 data-[selected=true]:bg-accent data-[selected=true]:text-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search the docs</DialogTitle>
        <DialogDescription className="sr-only">
          Type to filter pages and sections; Enter opens the selection.
        </DialogDescription>
        <Command label="Search the docs" loop filter={score}>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <SearchIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <Command.Input
              autoFocus
              placeholder="Search pages and sections…"
              className="h-12 w-full bg-transparent text-[0.95rem] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-[min(60vh,26rem)] overflow-y-auto p-2">
            {!rows && !failed && (
              <Command.Loading>
                <p className="px-3 py-6 text-center text-[0.85rem] text-muted-foreground">
                  Loading the index…
                </p>
              </Command.Loading>
            )}
            {failed && (
              <p className="px-3 py-6 text-center text-[0.85rem] text-destructive">
                The search index did not load. The sidebar lists every page.
              </p>
            )}
            {rows && (
              <Command.Empty className="px-3 py-6 text-center text-[0.85rem] text-muted-foreground">
                Nothing in the docs matches that.
              </Command.Empty>
            )}
            {sections.map(([section, pages]) => (
              <Command.Group
                key={section}
                heading={section}
                className="[&_[cmdk-group-heading]]:mono [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[0.7rem] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {pages.map((p) => (
                  <div key={p.href}>
                    <Command.Item
                      value={`${p.title} — ${p.href}`}
                      keywords={[p.description]}
                      onSelect={() => go(p.href)}
                      className={item}
                    >
                      <span className="font-medium text-foreground">
                        {p.title}
                      </span>
                      <span className="line-clamp-1 text-[0.8rem] text-muted-foreground">
                        {p.description}
                      </span>
                    </Command.Item>
                    {p.headings.map((h) => (
                      <Command.Item
                        key={h.slug}
                        value={`${h.text} — ${p.href}#${h.slug}`}
                        keywords={[p.title]}
                        onSelect={() => go(`${p.href}#${h.slug}`)}
                        className={cn(item, "pl-7 text-[0.85rem]")}
                      >
                        <span>
                          <span className="text-muted-foreground"># </span>
                          {h.text}
                        </span>
                      </Command.Item>
                    ))}
                  </div>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
