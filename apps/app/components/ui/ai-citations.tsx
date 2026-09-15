"use client";

/*
 * The sources an answer leans
 * on: an inline pill naming the site a claim came from, with a preview
 * on hover; favicon stacks; a sources button that opens the full list
 * in a sheet; and the older numbered marker and collapsible list.
 * import * as React from "react";
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
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface CitationItem {
  id: string;
  title: React.ReactNode;
  /** The site, as shown: `wikipedia.org`. */
  domain?: string;
  url?: string;
  /** A line or two from the page. */
  snippet?: React.ReactNode;
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

/** What a citation reads as when it has to be short: its site, else its title. */
function shortName(citation: CitationItem): React.ReactNode {
  return citation.domain ?? citation.title;
}

/* ----------------------------------------------------------------------------
 * Citation: the numbered inline marker that jumps to its reference.
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
  domain,
  className,
}: {
  url?: string;
  /** Used when there is no url to read the site from. */
  domain?: string;
  className?: string;
}) {
  const favicon = useFavicon(url ?? (domain ? `https://${domain}` : undefined));

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
          domain={citation.domain}
          className="size-6 rounded-full bg-background ring-2 ring-background"
        />
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * CitationCard: one source, read at a glance — site, title, snippet.
 * ------------------------------------------------------------------------- */

function CitationCard({
  citation,
  index,
  className,
}: {
  citation: CitationItem;
  index?: number;
  className?: string;
}) {
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <CitationFavicon
          url={citation.url}
          domain={citation.domain}
          className="size-4 [&_img]:size-3.5 [&_svg]:size-3"
        />
        <span className="min-w-0 truncate">{shortName(citation)}</span>
        {index !== undefined ? (
          <span
            className="ml-auto grid size-4 shrink-0 place-items-center rounded bg-foreground/5 font-semibold tabular-nums"
            style={TINY_TEXT}
          >
            {index}
          </span>
        ) : null}
      </span>
      {citation.domain && citation.title !== citation.domain ? (
        <span className="line-clamp-2 text-sm leading-5 font-medium text-foreground">
          {citation.title}
        </span>
      ) : null}
      {citation.snippet ? (
        <span className="line-clamp-2 text-xs leading-4 text-muted-foreground">
          {citation.snippet}
        </span>
      ) : null}
    </>
  );
  const classes = cn(
    "grid gap-1 rounded-md p-2 text-left outline-none transition-colors",
    citation.url && "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
    className
  );

  return citation.url ? (
    <a
      data-slot="citation-card"
      href={citation.url}
      target="_blank"
      rel="noreferrer noopener"
      className={classes}
    >
      {content}
    </a>
  ) : (
    <div data-slot="citation-card" className={classes}>
      {content}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * CitationPill: the inline source — `wikipedia.org +2` — with the sources
 * it stands for on hover. Clicking it opens the first source.
 * ------------------------------------------------------------------------- */

export interface CitationPillProps {
  /** The sources this claim cites, in order; the first names the pill. */
  citations: CitationItem[];
  /** Assistive-tech name, e.g. "Source: wikipedia.org". */
  label?: string;
  className?: string;
}

function CitationPill({ citations, label, className }: CitationPillProps) {
  const [first, ...rest] = citations;
  if (!first) return null;

  const pillClass = cn(
    "mx-0.5 inline-flex max-w-44 -translate-y-px items-center gap-1 rounded-full bg-muted px-1.5 align-middle text-xs leading-5 font-medium text-muted-foreground no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
    className
  );
  const pill = (
    <>
      <CitationFavicon
        url={first.url}
        domain={first.domain}
        className="size-3.5 [&_img]:size-3 [&_svg]:size-3"
      />
      <span className="min-w-0 truncate">{shortName(first)}</span>
      {rest.length > 0 ? (
        <span className="shrink-0 tabular-nums opacity-70">+{rest.length}</span>
      ) : null}
    </>
  );

  return (
    <HoverCard>
      <HoverCardTrigger
        data-slot="citation-pill"
        delay={150}
        aria-label={label}
        className={pillClass}
        render={
          first.url ? (
            <a href={first.url} target="_blank" rel="noreferrer noopener" />
          ) : (
            <span tabIndex={0} />
          )
        }
      >
        {pill}
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="grid w-80 gap-0.5 p-1">
        {citations.map((citation) => (
          <CitationCard key={citation.id} citation={citation} />
        ))}
      </HoverCardContent>
    </HoverCard>
  );
}

/* ----------------------------------------------------------------------------
 * CitationSources: the favicons and a count under an answer; the full
 * list opens in a sheet beside it.
 * ------------------------------------------------------------------------- */

export interface CitationSourcesProps {
  citations: CitationItem[];
  /** The button's text, e.g. "5 sources". */
  label: React.ReactNode;
  /** The sheet's heading, e.g. "Sources". */
  title: React.ReactNode;
  className?: string;
}

function CitationSources({
  citations,
  label,
  title,
  className,
}: CitationSourcesProps) {
  if (citations.length === 0) return null;

  return (
    <Sheet>
      <SheetTrigger
        data-slot="citation-sources"
        render={<button type="button" />}
        className={cn(
          "inline-flex h-8 w-fit items-center gap-2 rounded-full border bg-background py-1 pr-3 pl-1 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
      >
        <CitationStack citations={citations} className="[&>span]:size-5.5" />
        <span className="font-medium">{label}</span>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 content-start gap-0.5 overflow-y-auto p-2">
          {citations.map((citation) => (
            <CitationCard
              key={citation.id}
              citation={citation}
              index={Number.isNaN(Number(citation.id)) ? undefined : Number(citation.id)}
              className="p-2.5"
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
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
      <CitationFavicon url={citation.url} domain={citation.domain} />
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

export {
  Citation,
  CitationCard,
  CitationFavicon,
  CitationList,
  CitationPill,
  Citations,
  CitationSources,
  CitationStack,
};
