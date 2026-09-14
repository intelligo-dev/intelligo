"use client";

/*
 * The sources an answer leans
 * on: an inline marker that jumps to its reference, favicon stacks, and
 * a collapsible reference list. import * as React from "react";
import {
  BookOpenTextIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  Globe2Icon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  Disclosure,
  EASE_OUT,
  SPRING_LAYOUT,
  SPRING_SWAP,
} from "@/components/ui/ai-motion";
import { cn } from "@/lib/utils";

export interface CitationItem {
  id: string;
  title: React.ReactNode;
  domain?: React.ReactNode;
  url?: string;
}

/** The 10px index badges; the type scale has no step this small. */
const TINY_TEXT: React.CSSProperties = { fontSize: "0.625rem" };

/* ----------------------------------------------------------------------------
 * Favicons. Resolve a site's conventional `/favicon.ico` and drop it once
 * it is known to be unusable, so a glyph is drawn instead of a broken
 * image. Plenty of sites answer with a 403 or 404, and `onError` is not
 * enough to catch it: an image the browser starts loading from
 * server-rendered HTML usually fails before React attaches a handler, and
 * that event is never replayed. `decode()` settles on the image's final
 * state instead of relying on an event firing at the right moment.
 * ------------------------------------------------------------------------- */

function getFaviconUrl(value: string) {
  try {
    return new URL("/favicon.ico", value).toString();
  } catch {
    return null;
  }
}

function useFavicon(url?: string) {
  const resolved = url ? getFaviconUrl(url) : null;
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const src = resolved && resolved !== failedSrc ? resolved : null;

  const ref = React.useCallback(
    (img: HTMLImageElement | null) => {
      if (!img || !src) return;

      let released = false;
      img.decode().catch(() => {
        if (!released) setFailedSrc(src);
      });

      // The node is going away or the source changed; a late rejection then
      // describes an image we are no longer showing.
      return () => {
        released = true;
      };
    },
    [src]
  );

  return { src, ref };
}

function citationTargetId(prefix: string, citationId: string) {
  return `${prefix}-${citationId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/* ----------------------------------------------------------------------------
 * Citation: the inline marker inside the answer.
 * ------------------------------------------------------------------------- */

export interface CitationProps
  extends Omit<React.ComponentProps<"a">, "href" | "children"> {
  citationId: string;
  index: number;
  /** Must match the related Citations idPrefix. */
  idPrefix: string;
  /** Assistive-tech name; defaults to "View citation {index}". */
  label?: string;
}

function Citation({
  citationId,
  index,
  idPrefix,
  label,
  className,
  style,
  ...props
}: CitationProps) {
  return (
    <a
      data-slot="citation"
      href={`#${citationTargetId(idPrefix, citationId)}`}
      aria-label={label ?? `View citation ${index}`}
      className={cn(
        "mx-0.5 inline-flex min-w-4 -translate-y-0.5 items-center justify-center rounded-md bg-muted/60 px-1 py-0.5 font-semibold leading-none text-muted-foreground no-underline outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      style={{ ...TINY_TEXT, ...style }}
      {...props}
    >
      {index}
    </a>
  );
}

/* ----------------------------------------------------------------------------
 * CitationFavicon and CitationStack.
 * ------------------------------------------------------------------------- */

function CitationFavicon({
  url,
  className,
}: {
  url?: string;
  className?: string;
}) {
  const favicon = useFavicon(url);

  return (
    <span
      data-slot="citation-favicon"
      aria-hidden="true"
      className={cn(
        "grid size-5 shrink-0 place-items-center text-muted-foreground",
        className
      )}
    >
      {favicon.src ? (
        // Dynamic cross-site favicons: a plain img keeps the item portable.
        <img
          ref={favicon.ref}
          src={favicon.src}
          alt=""
          width={16}
          height={16}
          referrerPolicy="no-referrer"
          className="size-4 rounded-sm object-contain"
        />
      ) : (
        <Globe2Icon className="size-3.5" />
      )}
    </span>
  );
}

export interface CitationStackProps {
  citations: CitationItem[];
  limit?: number;
  className?: string;
}

function CitationStack({ citations, limit = 3, className }: CitationStackProps) {
  return (
    <span
      data-slot="citation-stack"
      aria-hidden="true"
      className={cn("flex -space-x-1.5", className)}
    >
      {citations.slice(0, limit).map((citation) => (
        <CitationFavicon
          key={citation.id}
          url={citation.url}
          className="size-6 rounded-full bg-background ring-2 ring-background"
        />
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * CitationList: the numbered references.
 * ------------------------------------------------------------------------- */

function CitationRow({
  citation,
  index,
  idPrefix,
}: {
  citation: CitationItem;
  index: number;
  idPrefix: string;
}) {
  const content = (
    <>
      <CitationFavicon url={citation.url} />
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="truncate text-sm font-medium text-foreground/80 transition-colors group-hover/citation:text-foreground">
          {citation.title}
        </span>
        {citation.domain ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground/60">
            {citation.domain}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span
          className="grid size-5 place-items-center rounded-md bg-foreground/5 font-semibold tabular-nums text-muted-foreground"
          style={TINY_TEXT}
        >
          {index}
        </span>
        {citation.url ? (
          <ExternalLinkIcon className="size-3.5 text-muted-foreground/40 transition-colors group-hover/citation:text-muted-foreground" />
        ) : null}
      </span>
    </>
  );
  const className =
    "group/citation flex items-center gap-2 rounded-md px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const id = citationTargetId(idPrefix, citation.id);

  return citation.url ? (
    <a
      data-slot="citation-row"
      id={id}
      href={citation.url}
      target="_blank"
      rel="noreferrer noopener"
      className={className}
    >
      {content}
    </a>
  ) : (
    <div data-slot="citation-row" id={id} className={className}>
      {content}
    </div>
  );
}

export interface CitationListProps {
  citations: CitationItem[];
  idPrefix?: string;
  className?: string;
}

function CitationList({ citations, idPrefix, className }: CitationListProps) {
  const reduced = useReducedMotion() ?? false;
  const baseId = React.useId();
  const resolvedPrefix =
    idPrefix ?? `citation-list-${baseId.replace(/:/g, "")}`;

  return (
    <div data-slot="citation-list" className={cn("grid gap-0.5", className)}>
      <AnimatePresence mode="popLayout">
        {citations.map((citation, index) => (
          <motion.div
            layout="position"
            key={citation.id}
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -3 }}
            transition={
              reduced
                ? { duration: 0 }
                : {
                    opacity: { duration: 0.18, ease: EASE_OUT },
                    y: SPRING_LAYOUT,
                    layout: SPRING_LAYOUT,
                  }
            }
          >
            <CitationRow
              citation={citation}
              index={index + 1}
              idPrefix={resolvedPrefix}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Citations: the collapsible reference collection.
 * ------------------------------------------------------------------------- */

export interface CitationsProps {
  citations: CitationItem[];
  title?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  idPrefix?: string;
  className?: string;
}

function Citations({
  citations,
  title = "Sources",
  open,
  defaultOpen = false,
  onOpenChange,
  idPrefix,
  className,
}: CitationsProps) {
  const reduced = useReducedMotion() ?? false;
  const baseId = React.useId();
  const contentId = `${baseId}-content`;
  const resolvedPrefix = idPrefix ?? `citation-${baseId.replace(/:/g, "")}`;
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const currentOpen = open ?? internalOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (open === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange, open]
  );

  return (
    <div
      data-slot="citations"
      data-state={currentOpen ? "open" : "closed"}
      className={cn("w-full text-sm", className)}
    >
      <button
        data-slot="citations-trigger"
        type="button"
        aria-expanded={currentOpen}
        aria-controls={contentId}
        onClick={() => setOpen(!currentOpen)}
        className="group -ml-1 flex min-h-8 items-center gap-2 rounded-lg px-1 text-left text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BookOpenTextIcon className="size-4" />
        <span className="font-medium">{title}</span>
        <span
          className="rounded-full bg-muted px-1.5 py-0.5 font-semibold tabular-nums"
          style={TINY_TEXT}
        >
          {citations.length}
        </span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: currentOpen ? 180 : 0 }}
          transition={reduced ? { duration: 0 } : SPRING_SWAP}
          className="text-muted-foreground/60"
        >
          <ChevronDownIcon className="size-3.5" />
        </motion.span>
      </button>

      <Disclosure id={contentId} open={currentOpen}>
        <CitationList
          citations={citations}
          idPrefix={resolvedPrefix}
          className="mt-1"
        />
      </Disclosure>
    </div>
  );
}

export { Citation, CitationFavicon, CitationStack, CitationList, Citations };
