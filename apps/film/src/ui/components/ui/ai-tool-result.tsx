"use client";

/*
 * The result of a tool the agent ran — a one-line summary that opens onto
 * the output, with the status rolling from running to done, a copy and a
 * run-again action, and the viewport following the output while it
 * streams.
 */

import * as React from "react";
import {
  BanIcon,
  BracesIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  CircleXIcon,
  CopyIcon,
  RotateCcwIcon,
  SquareTerminalIcon,
  WrenchIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import {
  type CodeLanguage,
  HighlightedCode,
} from "@ui/components/ui/ai-code-block";
import { Disclosure, SPRING_SWAP, SwapText } from "@ui/components/ui/ai-motion";
import { Button } from "@ui/components/ui/button";
import { Spinner } from "@ui/components/ui/spinner";
import { cn } from "@ui/lib/utils";

export type ToolResultStatus = "running" | "success" | "error" | "cancelled";
export type ToolResultKind = "terminal" | "request" | "custom";

const STATUS_LABELS: Record<ToolResultStatus, string> = {
  running: "Running",
  success: "Completed",
  error: "Failed",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<ToolResultStatus, string> = {
  running: "text-info",
  success: "text-success",
  error: "text-destructive",
  cancelled: "text-muted-foreground",
};

function getSwapKey(value: React.ReactNode, fallback: string) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
}

function KindIcon({ kind }: { kind: ToolResultKind }) {
  if (kind === "terminal") return <SquareTerminalIcon className="size-4" />;
  if (kind === "request") return <BracesIcon className="size-4" />;
  return <WrenchIcon className="size-4" />;
}

function StatusIcon({
  status,
  label,
}: {
  status: ToolResultStatus;
  label: string;
}) {
  if (status === "running") return <Spinner className="size-3" aria-label={label} />;
  if (status === "success") return <CircleCheckIcon className="size-3" />;
  if (status === "error") return <CircleXIcon className="size-3" />;
  return <BanIcon className="size-3" />;
}

function ToolResultAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      data-slot="tool-result-action"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="text-muted-foreground"
    >
      {children}
    </Button>
  );
}

/* ----------------------------------------------------------------------------
 * ToolResultOutput: the tool's text, highlighted, wrapping in the pane.
 * ------------------------------------------------------------------------- */

export interface ToolResultOutputProps
  extends Omit<React.ComponentProps<typeof HighlightedCode>, "code" | "children"> {
  children: string;
  language?: CodeLanguage;
}

function ToolResultOutput({
  children,
  language = "bash",
  className,
  ...props
}: ToolResultOutputProps) {
  return (
    <HighlightedCode
      data-slot="tool-result-output"
      code={children}
      language={language}
      className={cn("break-words whitespace-pre-wrap text-foreground/80", className)}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------------------
 * ToolResult
 * ------------------------------------------------------------------------- */

export interface ToolResultProps
  extends Omit<React.ComponentProps<"div">, "title" | "children"> {
  /** The tool's name, in monospace. */
  tool: React.ReactNode;
  /** What the call did, in words. */
  title: React.ReactNode;
  children: React.ReactNode;
  status?: ToolResultStatus;
  kind?: ToolResultKind;
  /** A small detail next to the title — a duration, a count. */
  meta?: React.ReactNode;
  /** Replaces the kind icon. */
  icon?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Close the output once the run ends; a new run opens it again. */
  collapseOnComplete?: boolean;
  /** Pixel height the output scrolls within. */
  maxHeight?: number;
  /** Text the copy action writes; `onCopy` takes over when given. */
  copyText?: string;
  onCopy?: () => void | Promise<void>;
  onRetry?: () => void;
  contentClassName?: string;
  statusLabels?: Partial<Record<ToolResultStatus, string>>;
  copyLabel?: string;
  copiedLabel?: string;
  retryLabel?: string;
}

function ToolResult({
  tool,
  title,
  children,
  status = "running",
  kind = "custom",
  meta,
  icon,
  open,
  defaultOpen = true,
  onOpenChange,
  collapseOnComplete = true,
  maxHeight = 220,
  copyText,
  onCopy,
  onRetry,
  className,
  contentClassName,
  statusLabels,
  copyLabel = "Copy result",
  copiedLabel = "Copied",
  retryLabel = "Run again",
  ...props
}: ToolResultProps) {
  const reduce = useReducedMotion() ?? false;
  const baseId = React.useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const previousStatus = React.useRef(status);
  const copyTimer = React.useRef<number | undefined>(undefined);
  const [copied, setCopied] = React.useState(false);
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const currentOpen = open ?? internalOpen;
  const running = status === "running";
  const canCopy = Boolean(copyText || onCopy);
  const labels = { ...STATUS_LABELS, ...statusLabels };
  const statusLabel = labels[status];
  const titleKey = getSwapKey(title, status);
  const metaKey = getSwapKey(meta, `${status}-meta`);
  const toolKey = getSwapKey(tool, `${status}-tool`);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (open === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange, open]
  );

  React.useEffect(() => {
    if (previousStatus.current !== "running" && status === "running") {
      setOpen(true);
    }
    if (
      previousStatus.current === "running" &&
      status !== "running" &&
      collapseOnComplete
    ) {
      setOpen(false);
    }
    previousStatus.current = status;
  }, [collapseOnComplete, setOpen, status]);

  React.useEffect(
    () => () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    },
    []
  );

  // While the tool runs the viewport follows the newest output.
  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !currentOpen || !running) return;

    const frame = requestAnimationFrame(() => {
      if (typeof viewport.scrollTo === "function") {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: reduce ? "auto" : "smooth",
        });
      } else {
        viewport.scrollTop = viewport.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  const handleCopy = React.useCallback(async () => {
    if (onCopy) await onCopy();
    else if (copyText) await navigator.clipboard?.writeText(copyText);

    setCopied(true);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
  }, [copyText, onCopy]);

  return (
    <div
      data-slot="tool-result"
      data-state={status}
      data-kind={kind}
      aria-busy={running || undefined}
      className={cn("w-full text-sm", className)}
      {...props}
    >
      <button
        id={triggerId}
        type="button"
        data-slot="tool-result-trigger"
        aria-expanded={currentOpen}
        aria-controls={contentId}
        onClick={() => setOpen(!currentOpen)}
        className="group/tool-result flex min-h-9 w-full items-center gap-2 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span
          aria-hidden="true"
          className="grid size-4 shrink-0 place-items-center text-muted-foreground"
        >
          {icon ?? <KindIcon kind={kind} />}
        </span>
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="min-w-0 truncate font-medium text-foreground/90">
            <SwapText value={titleKey}>{title}</SwapText>
          </span>
          {meta ? (
            <span className="shrink-0 text-xs text-muted-foreground/60">
              <SwapText value={metaKey}>{meta}</SwapText>
            </span>
          ) : null}
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/55">
            <SwapText value={toolKey}>{tool}</SwapText>
          </span>
        </span>
        <span
          data-slot="tool-result-status"
          className={cn(
            "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
            STATUS_CLASS[status]
          )}
        >
          <StatusIcon status={status} label={statusLabel} />
          <SwapText value={status}>{statusLabel}</SwapText>
        </span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: currentOpen ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : SPRING_SWAP}
          className="shrink-0 text-muted-foreground/50 transition-colors group-hover/tool-result:text-muted-foreground"
        >
          <ChevronDownIcon className="size-3.5" />
        </motion.span>
      </button>

      <Disclosure
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        open={currentOpen}
      >
        <div className="pt-1.5 pl-6">
          <div
            data-slot="tool-result-panel"
            className="overflow-hidden rounded-xl bg-muted/80"
          >
            <div
              ref={viewportRef}
              data-slot="tool-result-viewport"
              role="log"
              aria-live="polite"
              className="overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ maxHeight }}
            >
              <div className={cn("p-3", contentClassName)}>{children}</div>
            </div>

            {canCopy || onRetry ? (
              <div
                data-slot="tool-result-actions"
                className="flex items-center gap-0.5 px-2 pb-1.5"
              >
                {canCopy ? (
                  <ToolResultAction
                    label={copied ? copiedLabel : copyLabel}
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <CheckIcon className="size-3.5" />
                    ) : (
                      <CopyIcon className="size-3.5" />
                    )}
                  </ToolResultAction>
                ) : null}
                {onRetry ? (
                  <ToolResultAction label={retryLabel} onClick={onRetry}>
                    <RotateCcwIcon className="size-3.5" />
                  </ToolResultAction>
                ) : null}
                <span className="ml-auto text-xs text-muted-foreground/55">
                  <SwapText value={status}>{statusLabel}</SwapText>
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </Disclosure>
    </div>
  );
}

export { ToolResult, ToolResultOutput };
