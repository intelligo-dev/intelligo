import { Suspense, lazy, useEffect, useState } from "react";
import { SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Search over the docs, from the nav of every page. Opened by the button
 * — an icon below `lg`, which is what exists on a phone — or by ⌘K /
 * Ctrl-K, or `/` when the reader is not typing somewhere. The dialog is
 * its own chunk, loaded the first time it opens. One instance per page:
 * it owns the key listener.
 */
const DocsSearchDialog = lazy(() => import("@/components/docs-search-dialog"));

export function DocsSearch({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false);
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setWanted(true);
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setWanted(true);
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setWanted(true);
          setOpen(true);
        }}
        aria-label="Search docs"
        aria-keyshortcuts="Meta+K Control+K /"
        className={cn(
          "flex size-9 items-center justify-center gap-2 rounded-lg border border-transparent text-[0.82rem] text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground lg:w-64 lg:justify-start lg:border-input lg:bg-background lg:px-3 lg:hover:border-foreground/30 lg:hover:bg-background",
          className
        )}
      >
        <SearchIcon aria-hidden="true" className="size-4 lg:size-3.5" />
        <span className="hidden lg:inline">Search docs</span>
        <kbd className="mono ml-auto hidden rounded border border-border px-1.5 text-[0.7rem] text-muted-foreground lg:inline">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      {wanted && (
        <Suspense fallback={null}>
          <DocsSearchDialog open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}
