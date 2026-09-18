"use client";

/*
 * One adaptive stream of what the agent is doing: reasoning text, plan
 * steps, web searches with their results, tool calls and structured
 * traces. While the run is working the newest rows glide up under a fade;
 * once complete the stream folds into a one-line summary that opens on
 * demand.
 */

import * as React from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  CircleIcon,
  FileTextIcon,
  Globe2Icon,
  ImageIcon,
  MessageSquareIcon,
  PencilLineIcon,
  SearchIcon,
  SparklesIcon,
  SquareTerminalIcon,
  WrenchIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  EASE_OUT,
  Disclosure,
  SPRING_LAYOUT,
  SPRING_SWAP,
} from "@/components/ui/ai-motion";
import { ShimmerText } from "@/components/ui/ai-shimmer-text";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
 * Items
 * ------------------------------------------------------------------------- */

export type AgentActivityStatus = "working" | "complete";
export type AgentStepStatus = "pending" | "active" | "complete";

export interface AgentActivityStep {
  id: string;
  type: "step";
  label: React.ReactNode;
  status?: AgentStepStatus;
  meta?: React.ReactNode;
}

export interface AgentActivityText {
  id: string;
  type: "text";
  content: React.ReactNode;
}

export interface AgentSearchResult {
  id: string;
  title: React.ReactNode;
  domain?: React.ReactNode;
  url?: string;
  icon?: React.ReactNode;
}

/** A row's own state inside the stream; rows are complete by default. */
export type AgentRowStatus = "running" | "complete" | "error";

export interface AgentActivitySearch {
  id: string;
  type: "search";
  query: React.ReactNode;
  results?: AgentSearchResult[];
  moreCount?: number;
  status?: AgentRowStatus;
  /** Shown under the row when the reader opens it — the raw call, say. */
  details?: React.ReactNode;
}

export interface AgentActivityTool {
  id: string;
  type: "tool";
  action: "read" | "edit" | "run" | (string & {});
  target?: React.ReactNode;
  additions?: number;
  deletions?: number;
  status?: AgentRowStatus;
  /** Shown under the row when the reader opens it — the raw call, say. */
  details?: React.ReactNode;
}

export type AgentTraceKind =
  | "thinking"
  | "message"
  | "write"
  | "run"
  | "read"
  | (string & {});

export interface AgentActivityTrace {
  id: string;
  type: "trace";
  kind: AgentTraceKind;
  label: React.ReactNode;
  detail?: React.ReactNode;
  icon?: React.ReactNode;
}

export type AgentActivityItem =
  | AgentActivityStep
  | AgentActivityText
  | AgentActivitySearch
  | AgentActivityTool
  | AgentActivityTrace;

export type AgentActivityContentType = AgentActivityItem["type"] | "mixed";

/* ----------------------------------------------------------------------------
 * Labels — every visible string, with an English default.
 * ------------------------------------------------------------------------- */

export interface AgentActivitySummaryLabels {
  /** Step- or text-only runs: `duration` is already formatted. */
  thought: (duration: string) => React.ReactNode;
  searched: string;
  tools: (count: number) => string;
  trace: (toolCalls: number, messages: number) => string;
  steps: (count: number) => string;
}

const DEFAULT_ACTIVE_LABELS: Record<AgentActivityContentType, string> = {
  step: "Thinking…",
  text: "Thinking…",
  search: "Searching the web…",
  tool: "Running tools…",
  trace: "Working through the run…",
  mixed: "Working through it…",
};

const DEFAULT_SUMMARY_LABELS: AgentActivitySummaryLabels = {
  thought: (duration) => (
    <>
      Thought for <span className="tabular-nums">{duration}</span>
    </>
  ),
  searched: "Searched the web",
  tools: (count) => `Ran ${count} ${count === 1 ? "tool" : "tools"}`,
  trace: (toolCalls, messages) =>
    `${toolCalls} ${toolCalls === 1 ? "tool call" : "tool calls"}, ${messages} ${messages === 1 ? "message" : "messages"}`,
  steps: (count) => `Completed ${count} ${count === 1 ? "step" : "steps"}`,
};

function defaultFormatDuration(duration: number) {
  const seconds = Math.max(0, Math.round(duration));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

function defaultMoreLabel(count: number) {
  return `+${count} more`;
}

function defaultActionLabel(action: string) {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

/* ----------------------------------------------------------------------------
 * Rows
 * ------------------------------------------------------------------------- */

function StepRow({ item }: { item: AgentActivityStep }) {
  const reduce = useReducedMotion() ?? false;
  const state = item.status ?? "complete";

  return (
    <div
      data-slot="agent-activity-step"
      data-status={state}
      className="flex min-h-7 items-start gap-2.5 rounded-md px-1.5 py-1"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-4 shrink-0 place-items-center text-muted-foreground/70"
      >
        {state === "complete" ? (
          <CheckIcon className="size-4" strokeWidth={1.8} />
        ) : state === "active" ? (
          <span className="relative grid size-3 place-items-center">
            <motion.span
              className="absolute inset-0 rounded-full bg-foreground/10"
              animate={
                reduce ? { opacity: 0.6 } : { opacity: [0.35, 0.8, 0.35] }
              }
              transition={
                reduce
                  ? { duration: 0 }
                  : { duration: 1.5, repeat: Number.POSITIVE_INFINITY }
              }
            />
            <span className="size-1.5 rounded-full bg-foreground/60" />
          </span>
        ) : (
          <CircleIcon className="size-3" strokeWidth={1.5} />
        )}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 leading-5",
          state === "pending"
            ? "text-muted-foreground/55"
            : "text-foreground/90"
        )}
      >
        {item.label}
      </span>
      {item.meta ? (
        <span className="shrink-0 leading-5 text-muted-foreground/55">
          {item.meta}
        </span>
      ) : null}
    </div>
  );
}

function TextRow({ item }: { item: AgentActivityText }) {
  return (
    <div
      data-slot="agent-activity-text"
      className="rounded-md px-1.5 py-1 leading-5 text-muted-foreground"
    >
      {item.content}
    </div>
  );
}

function SearchResultRow({ result }: { result: AgentSearchResult }) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className="grid size-5 shrink-0 place-items-center text-muted-foreground"
      >
        {result.icon ?? <Globe2Icon className="size-3" strokeWidth={2} />}
      </span>
      <span className="min-w-0 truncate font-medium text-foreground/90">
        {result.title}
      </span>
      {result.domain ? (
        <span className="min-w-0 truncate text-muted-foreground/55">
          {result.domain}
        </span>
      ) : null}
    </>
  );
  const className = cn(
    "flex min-h-7 items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none transition-colors",
    result.url && "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
  );

  return result.url ? (
    <a
      data-slot="agent-activity-search-result"
      href={result.url}
      target="_blank"
      rel="noreferrer noopener"
      className={className}
    >
      {content}
    </a>
  ) : (
    <div data-slot="agent-activity-search-result" className={className}>
      {content}
    </div>
  );
}

/** A row's glyph, pulsing while its call runs; an alert once it failed. */
function RowStatusIcon({
  status,
  children,
}: {
  status: AgentRowStatus;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion() ?? false;
  if (status === "error") {
    return <CircleAlertIcon className="size-4 text-destructive" strokeWidth={1.8} />;
  }
  if (status === "running") {
    return (
      <motion.span
        className="grid size-4 place-items-center"
        animate={reduce ? { opacity: 0.7 } : { opacity: [0.4, 1, 0.4] }}
        transition={
          reduce
            ? { duration: 0 }
            : { duration: 1.4, repeat: Number.POSITIVE_INFINITY }
        }
      >
        {children}
      </motion.span>
    );
  }
  return <>{children}</>;
}

/** A row that opens onto its details, when it has any. */
function RowWithDetails({
  details,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "children" | "className"> & {
  details?: React.ReactNode;
  className: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion() ?? false;
  const [open, setOpen] = React.useState(false);
  const detailsId = React.useId();

  if (!details) {
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  }

  return (
    <div {...props}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen(!open)}
        className={cn(
          className,
          "group/row w-full text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        {children}
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : SPRING_SWAP}
          className={cn(
            "inline-flex shrink-0 text-muted-foreground/60 transition-opacity group-hover/row:opacity-100 group-focus-visible/row:opacity-100",
            open ? "opacity-100" : "opacity-0"
          )}
        >
          <ChevronDownIcon className="size-3.5" />
        </motion.span>
      </button>
      <Disclosure id={detailsId} open={open}>
        <div data-slot="agent-activity-details" className="pt-1 pr-1.5 pb-2 pl-8">
          {details}
        </div>
      </Disclosure>
    </div>
  );
}

function SearchRow({
  item,
  moreLabel,
}: {
  item: AgentActivitySearch;
  moreLabel: (count: number) => string;
}) {
  const reduce = useReducedMotion() ?? false;
  const enter = reduce ? { opacity: 1 } : { opacity: 0, y: 6 };
  const visible = { opacity: 1, y: 0 };
  const exit = reduce ? { opacity: 0 } : { opacity: 0, y: -3 };
  const transition = reduce
    ? { duration: 0 }
    : {
        opacity: { duration: 0.18, ease: EASE_OUT },
        y: SPRING_LAYOUT,
        layout: SPRING_LAYOUT,
      };

  return (
    <div
      data-slot="agent-activity-search"
      data-status={item.status ?? "complete"}
      className="space-y-0.5"
    >
      <RowWithDetails
        details={item.details}
        className="flex min-h-7 items-center gap-2.5 rounded-md px-1.5 py-1 text-muted-foreground"
      >
        <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center">
          <RowStatusIcon status={item.status ?? "complete"}>
            <SearchIcon className="size-4" strokeWidth={1.7} />
          </RowStatusIcon>
        </span>
        <span className="min-w-0 flex-1 truncate">{item.query}</span>
      </RowWithDetails>
      {item.results?.length ? (
        <div className="space-y-0.5 pl-4">
          <AnimatePresence initial mode="popLayout">
            {item.results.map((result) => (
              <motion.div
                layout="position"
                key={result.id}
                initial={enter}
                animate={visible}
                exit={exit}
                transition={transition}
              >
                <SearchResultRow result={result} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : null}
      <AnimatePresence initial>
        {item.moreCount ? (
          <motion.div
            key="more-results"
            initial={enter}
            animate={visible}
            exit={exit}
            transition={transition}
            className="px-1.5 py-1 pl-8 text-muted-foreground/55"
          >
            {moreLabel(item.moreCount)}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ActionIcon({ action }: { action: string }) {
  if (action === "read") return <FileTextIcon className="size-4" />;
  if (action === "edit" || action === "write") {
    return <PencilLineIcon className="size-4" />;
  }
  if (action === "run") return <SquareTerminalIcon className="size-4" />;
  return <WrenchIcon className="size-4" />;
}

function ToolRow({
  item,
  actionLabels,
}: {
  item: AgentActivityTool;
  actionLabels?: Record<string, string>;
}) {
  const action = actionLabels?.[item.action] ?? defaultActionLabel(item.action);
  const status = item.status ?? "complete";

  return (
    <RowWithDetails
      data-slot="agent-activity-tool"
      data-action={item.action}
      data-status={status}
      details={item.details}
      className="flex min-h-8 min-w-0 items-center gap-2.5 rounded-md px-1.5 py-0.5 leading-5"
    >
      <span
        aria-hidden="true"
        className="grid size-4 shrink-0 place-items-center text-muted-foreground/70"
      >
        <RowStatusIcon status={status}>
          <ActionIcon action={item.action} />
        </RowStatusIcon>
      </span>
      <span className="shrink-0 font-medium text-foreground/90">{action}</span>
      {item.target ? (
        <span
          className={cn(
            "min-w-0 flex-1 truncate rounded-lg bg-muted/80 px-2.5 py-1 font-mono text-xs text-muted-foreground",
            status === "error" && "bg-transparent px-0 font-sans text-destructive"
          )}
        >
          {item.target}
        </span>
      ) : (
        <span className="flex-1" />
      )}
      {typeof item.additions === "number" ||
      typeof item.deletions === "number" ? (
        <span className="flex shrink-0 items-center gap-2 font-mono tabular-nums">
          {typeof item.additions === "number" ? (
            <span className="text-success">+{item.additions}</span>
          ) : null}
          {typeof item.deletions === "number" ? (
            <span className="text-destructive">−{item.deletions}</span>
          ) : null}
        </span>
      ) : null}
    </RowWithDetails>
  );
}

function TraceIcon({ kind }: { kind: AgentTraceKind }) {
  if (kind === "thinking") return <SparklesIcon className="size-4" />;
  if (kind === "message") return <MessageSquareIcon className="size-4" />;
  if (kind === "write") return <PencilLineIcon className="size-4" />;
  if (kind === "run") return <SquareTerminalIcon className="size-4" />;
  if (kind === "read") return <ImageIcon className="size-4" />;
  return <WrenchIcon className="size-4" />;
}

function TraceRow({ item }: { item: AgentActivityTrace }) {
  return (
    <div
      data-slot="agent-activity-trace"
      data-kind={item.kind}
      className="grid min-h-8 items-center gap-2.5 rounded-md px-1.5 py-0.5"
      style={{ gridTemplateColumns: "1rem auto minmax(0, 1fr)" }}
    >
      <span
        aria-hidden="true"
        className="grid size-4 place-items-center text-muted-foreground/70"
      >
        {item.icon ?? <TraceIcon kind={item.kind} />}
      </span>
      <span className="font-medium text-foreground/90">{item.label}</span>
      {item.detail ? (
        <span className="min-w-0 truncate rounded-lg bg-muted/80 px-2.5 py-1 font-mono text-xs text-muted-foreground/70">
          {item.detail}
        </span>
      ) : (
        <span />
      )}
    </div>
  );
}

export interface AgentActivityRowProps {
  item: AgentActivityItem;
  /** "+3 more" under a search's results. */
  moreLabel?: (count: number) => string;
  /** The word shown for a tool action (`read` → "Read"); capitalised by default. */
  actionLabels?: Record<string, string>;
}

function AgentActivityRow({
  item,
  moreLabel = defaultMoreLabel,
  actionLabels,
}: AgentActivityRowProps) {
  if (item.type === "text") return <TextRow item={item} />;
  if (item.type === "search")
    return <SearchRow item={item} moreLabel={moreLabel} />;
  if (item.type === "tool")
    return <ToolRow item={item} actionLabels={actionLabels} />;
  if (item.type === "trace") return <TraceRow item={item} />;
  return <StepRow item={item} />;
}

/* ----------------------------------------------------------------------------
 * The stream
 * ------------------------------------------------------------------------- */

export interface AgentActivityProps extends Omit<
  React.ComponentProps<"div">,
  "children"
> {
  /** Chronological activity entries. Append or update items as events stream. */
  items: AgentActivityItem[];
  /** Expected activity kind before the first streamed item arrives. */
  contentType?: AgentActivityContentType;
  /** Current run phase. Active runs always stay expanded. */
  status?: AgentActivityStatus;
  /** Elapsed run time, in seconds. Used by the step-only summary. */
  duration?: number;
  /** Controlled expanded state used after the run completes. */
  open?: boolean;
  /** Initial expanded state used after the run completes. */
  defaultOpen?: boolean;
  /** Called when the completed activity disclosure changes state. */
  onOpenChange?: (open: boolean) => void;
  /** Collapse the disclosure when status changes from working to complete. */
  collapseOnComplete?: boolean;
  /** The status line while the run is active; overrides `activeLabels`. */
  activeLabel?: string;
  /** The status line per content kind while the run is active. */
  activeLabels?: Partial<Record<AgentActivityContentType, string>>;
  /** The completed summary; overrides `summaryLabels`. */
  summary?: React.ReactNode;
  /** The completed summary per content kind. */
  summaryLabels?: Partial<AgentActivitySummaryLabels>;
  /** "45s", "2m 5s" — for the step-only summary. */
  formatDuration?: (seconds: number) => string;
  /** "+3 more" under a search's results. */
  moreLabel?: (count: number) => string;
  /** The word shown for a tool action (`read` → "Read"); capitalised by default. */
  actionLabels?: Record<string, string>;
  /** Optional renderer for the contents of the active status row. */
  renderWorkingStatus?: (context: {
    label: string;
    duration: number;
  }) => React.ReactNode;
  /** Optional renderer for the contents before the built-in disclosure chevron. */
  renderCompletedStatus?: (context: {
    summary: React.ReactNode;
    duration: number;
  }) => React.ReactNode;
  /** Maximum visible activity height before the stream begins gliding. */
  maxHeight?: number;
  contentClassName?: string;
}

function useControllableOpen({
  open,
  defaultOpen,
  onOpenChange,
}: {
  open?: boolean;
  defaultOpen: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const controlled = open !== undefined;
  const currentOpen = open ?? internalOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!controlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange]
  );

  return [currentOpen, setOpen] as const;
}

function getContentType(items: AgentActivityItem[]): AgentActivityContentType {
  const first = items[0]?.type;
  return first && items.every((item) => item.type === first) ? first : "mixed";
}

function getSummary(
  type: AgentActivityContentType,
  items: AgentActivityItem[],
  duration: string,
  labels: AgentActivitySummaryLabels
): React.ReactNode {
  if (type === "step" || type === "text") return labels.thought(duration);
  if (type === "search") return labels.searched;
  if (type === "tool") return labels.tools(items.length);
  if (type === "trace") {
    const messages = items.filter(
      (item) =>
        item.type === "trace" &&
        (item.kind === "thinking" || item.kind === "message")
    ).length;
    return labels.trace(items.length - messages, messages);
  }
  return labels.steps(items.length);
}

function AgentActivity({
  items,
  contentType: initialContentType,
  status = "working",
  duration = 0,
  open,
  defaultOpen = false,
  onOpenChange,
  collapseOnComplete = true,
  activeLabel,
  activeLabels,
  summary,
  summaryLabels,
  formatDuration = defaultFormatDuration,
  moreLabel = defaultMoreLabel,
  actionLabels,
  renderWorkingStatus,
  renderCompletedStatus,
  maxHeight = 208,
  className,
  contentClassName,
  ...props
}: AgentActivityProps) {
  const reduce = useReducedMotion() ?? false;
  const baseId = React.useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;
  const contentRef = React.useRef<HTMLDivElement>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const previousStatus = React.useRef(status);
  const [contentHeight, setContentHeight] = React.useState(0);
  const [currentOpen, setOpen] = useControllableOpen({
    open,
    defaultOpen,
    onOpenChange,
  });
  const working = status === "working";
  const expanded = working || currentOpen;
  const contentType = items.length
    ? getContentType(items)
    : (initialContentType ?? "mixed");
  // While working the viewport is a fixed window the content glides up
  // through; once complete it shrinks to fit (capped) and scrolls.
  const cappedHeight = Math.min(contentHeight, Math.max(0, maxHeight));
  const viewportHeight = working ? Math.max(0, maxHeight) : cappedHeight;
  const capped = contentHeight > maxHeight;
  const streamOffset = working
    ? Math.min(0, viewportHeight - contentHeight)
    : 0;

  React.useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;

    const measure = () => setContentHeight(node.offsetHeight);
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (previousStatus.current === "working" && status === "complete") {
      setOpen(!collapseOnComplete);
    }
    previousStatus.current = status;
  }, [collapseOnComplete, setOpen, status]);

  const toggle = () => {
    const next = !currentOpen;
    setOpen(next);
    if (next) {
      requestAnimationFrame(() => viewportRef.current?.scrollTo({ top: 0 }));
    }
  };

  const liveLabel =
    activeLabel ??
    activeLabels?.[contentType] ??
    DEFAULT_ACTIVE_LABELS[contentType];
  const completedSummary =
    summary ??
    getSummary(contentType, items, formatDuration(duration), {
      ...DEFAULT_SUMMARY_LABELS,
      ...summaryLabels,
    });
  // Alpha-only masks: the colour words never paint.
  const maskImage = capped
    ? working
      ? "linear-gradient(to bottom, transparent, black 12px)"
      : "linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent)"
    : undefined;

  return (
    <div
      data-slot="agent-activity"
      data-state={working ? "working" : expanded ? "open" : "closed"}
      data-content={contentType}
      aria-busy={working}
      className={cn("w-full text-sm", className)}
      {...props}
    >
      {working ? (
        <div
          data-slot="agent-activity-status"
          id={triggerId}
          role="status"
          className="flex h-7 min-w-0 items-center text-muted-foreground"
        >
          {renderWorkingStatus ? (
            renderWorkingStatus({ label: liveLabel, duration })
          ) : (
            // This row is the live region; the shimmer must not nest a second one.
            <ShimmerText role={undefined} className="font-medium">
              {liveLabel}
            </ShimmerText>
          )}
        </div>
      ) : (
        <button
          data-slot="agent-activity-trigger"
          id={triggerId}
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={toggle}
          className="group flex h-7 min-w-0 items-center gap-1.5 rounded-md text-left font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="truncate">
            {renderCompletedStatus
              ? renderCompletedStatus({ summary: completedSummary, duration })
              : completedSummary}
          </span>
          <motion.span
            aria-hidden="true"
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : SPRING_SWAP}
            className="inline-flex shrink-0 text-muted-foreground/70 group-hover:text-foreground"
          >
            <ChevronDownIcon className="size-3.5" />
          </motion.span>
        </button>
      )}

      <Disclosure
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        open={expanded}
        openHeight={viewportHeight}
      >
        <div
          data-slot="agent-activity-viewport"
          ref={viewportRef}
          className={cn(
            "pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            capped && expanded && !working
              ? "overflow-y-auto"
              : "overflow-y-hidden"
          )}
          style={{
            height: viewportHeight,
            maskImage,
            WebkitMaskImage: maskImage,
          }}
        >
          <motion.div
            data-slot="agent-activity-list"
            ref={contentRef}
            role="list"
            initial={false}
            animate={{ y: streamOffset }}
            transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
            className={cn("space-y-0.5 py-2", contentClassName)}
          >
            <AnimatePresence mode="popLayout">
              {items.map((item) => (
                <motion.div
                  data-slot="agent-activity-item"
                  data-type={item.type}
                  layout="position"
                  key={item.id}
                  role="listitem"
                  initial={reduce ? { opacity: 1 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3 }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : {
                          opacity: { duration: 0.18, ease: EASE_OUT },
                          y: SPRING_LAYOUT,
                          layout: SPRING_LAYOUT,
                        }
                  }
                >
                  <AgentActivityRow
                    item={item}
                    moreLabel={moreLabel}
                    actionLabels={actionLabels}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </Disclosure>
    </div>
  );
}

export { AgentActivity, AgentActivityRow };
