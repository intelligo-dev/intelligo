"use client";

/*
 * An assistant reply as it streams and once it lands: the rendered
 * content, then the completion actions (copy, regenerate, feedback) and a
 * compact sources disclosure.
 */

import * as React from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  RotateCcwIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  type CitationItem,
  CitationList,
  CitationStack,
} from "@showcase/components/ui/ai-citations";
import {
  Disclosure,
  EASE_OUT,
  SPRING_PRESS,
  SPRING_SWAP,
} from "@showcase/components/ui/ai-motion";
import { Button } from "@showcase/components/ui/button";
import { cn } from "@showcase/lib/utils";

export type StreamingResponseStatus = "streaming" | "complete" | "error";
export type StreamingResponseFeedback = "up" | "down" | null;

export interface StreamingResponseProps {
  /** Rendered response content. Pass plain text or the output of a Markdown renderer. */
  children: React.ReactNode;
  status?: StreamingResponseStatus;
  /** Plain-text value copied by the built-in copy action. */
  copyText?: string;
  /** Overrides the built-in clipboard action. */
  onCopy?: () => void | Promise<void>;
  onRetry?: () => void;
  /** Optional sources shown as a compact footer disclosure after streaming. */
  sources?: CitationItem[];
  sourcesOpen?: boolean;
  defaultSourcesOpen?: boolean;
  onSourcesOpenChange?: (open: boolean) => void;
  sourceIdPrefix?: string;
  feedback?: StreamingResponseFeedback;
  defaultFeedback?: StreamingResponseFeedback;
  onFeedbackChange?: (feedback: StreamingResponseFeedback) => void;
  /** Set false when a surrounding conversation log announces streamed text. */
  announce?: boolean;
  /** Hides the built-in completion actions without changing response status. */
  showActions?: boolean;
  /**
   * The footer's own controls in place of copy, retry and feedback — a
   * product's action row. Rendered once the response completes, before
   * the sources toggle; `null` leaves only the sources.
   */
  actions?: React.ReactNode;
  /**
   * Style the content as prose (paragraph rhythm, lists, code). Off when
   * the children bring their own Markdown styles.
   */
  prose?: boolean;
  copyLabel?: string;
  copiedLabel?: string;
  retryLabel?: string;
  helpfulLabel?: string;
  notHelpfulLabel?: string;
  /** The sources toggle's text for a given count. */
  sourcesLabel?: (count: number) => string;
  className?: string;
  contentClassName?: string;
  actionsClassName?: string;
}

function defaultSourcesLabel(count: number) {
  return `${count} ${count === 1 ? "source" : "sources"}`;
}

function ResponseAction({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  /** Present on toggles only; drives `aria-pressed`. */
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion() ?? false;

  return (
    <Button
      data-slot="streaming-response-action"
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "text-muted-foreground hover:text-foreground",
        active && "bg-muted text-foreground"
      )}
      render={
        <motion.button
          whileTap={reduced ? undefined : { scale: 0.9 }}
          transition={SPRING_PRESS}
        />
      }
    >
      {children}
    </Button>
  );
}

function StreamingResponse({
  children,
  status = "streaming",
  copyText,
  onCopy,
  onRetry,
  sources = [],
  sourcesOpen,
  defaultSourcesOpen = false,
  onSourcesOpenChange,
  sourceIdPrefix,
  feedback,
  defaultFeedback = null,
  onFeedbackChange,
  announce = true,
  showActions = true,
  actions,
  prose = true,
  copyLabel = "Copy response",
  copiedLabel = "Copied",
  retryLabel = "Retry response",
  helpfulLabel = "Helpful",
  notHelpfulLabel = "Not helpful",
  sourcesLabel = defaultSourcesLabel,
  className,
  contentClassName,
  actionsClassName,
}: StreamingResponseProps) {
  const reduced = useReducedMotion() ?? false;
  const baseId = React.useId();
  const [copied, setCopied] = React.useState(false);
  const [internalFeedback, setInternalFeedback] =
    React.useState<StreamingResponseFeedback>(defaultFeedback);
  const [internalSourcesOpen, setInternalSourcesOpen] =
    React.useState(defaultSourcesOpen);
  const copyTimer = React.useRef<number | undefined>(undefined);
  const currentFeedback = feedback ?? internalFeedback;
  const currentSourcesOpen = sourcesOpen ?? internalSourcesOpen;
  const streaming = status === "streaming";
  const complete = status === "complete";
  const canCopy = Boolean(copyText || onCopy);
  const hasSources = sources.length > 0;
  const customActions = actions !== undefined;
  const shouldShowActions =
    showActions &&
    !streaming &&
    (customActions
      ? actions !== null || hasSources
      : canCopy || onRetry || complete || hasSources);
  const sourcesContentId = `${baseId}-sources`;
  const resolvedSourcePrefix =
    sourceIdPrefix ?? `response-source-${baseId.replace(/:/g, "")}`;

  React.useEffect(
    () => () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    },
    []
  );

  const handleCopy = React.useCallback(async () => {
    if (onCopy) await onCopy();
    else if (copyText) await navigator.clipboard?.writeText(copyText);

    setCopied(true);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
  }, [copyText, onCopy]);

  const setFeedback = (next: Exclude<StreamingResponseFeedback, null>) => {
    const value = currentFeedback === next ? null : next;
    if (feedback === undefined) setInternalFeedback(value);
    onFeedbackChange?.(value);
  };

  const setSourcesOpen = React.useCallback(
    (next: boolean) => {
      if (sourcesOpen === undefined) setInternalSourcesOpen(next);
      onSourcesOpenChange?.(next);
    },
    [onSourcesOpenChange, sourcesOpen]
  );

  return (
    <div
      data-slot="streaming-response"
      data-state={status}
      aria-busy={streaming}
      className={cn("w-full", className)}
    >
      <div
        data-slot="streaming-response-content"
        aria-live={announce ? "polite" : "off"}
        className={cn(
          prose &&
            "text-sm leading-6 text-foreground/90 [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_p+p]:mt-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/45 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
          contentClassName
        )}
      >
        {children}
      </div>

      <AnimatePresence initial={false}>
        {shouldShowActions ? (
          <motion.div
            data-slot="streaming-response-footer"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.22, ease: EASE_OUT }}
            className="mt-3"
          >
            <div
              data-slot="streaming-response-actions"
              className={cn("flex items-center gap-0.5", actionsClassName)}
            >
              {customActions ? actions : null}
              {!customActions && canCopy ? (
                <ResponseAction
                  label={copied ? copiedLabel : copyLabel}
                  onClick={handleCopy}
                >
                  {copied ? (
                    <CheckIcon className="size-3.5" />
                  ) : (
                    <CopyIcon className="size-3.5" />
                  )}
                </ResponseAction>
              ) : null}
              {!customActions && onRetry ? (
                <ResponseAction label={retryLabel} onClick={onRetry}>
                  <RotateCcwIcon className="size-3.5" />
                </ResponseAction>
              ) : null}
              {!customActions && complete ? (
                <>
                  <ResponseAction
                    label={helpfulLabel}
                    active={currentFeedback === "up"}
                    onClick={() => setFeedback("up")}
                  >
                    <ThumbsUpIcon className="size-3.5" />
                  </ResponseAction>
                  <ResponseAction
                    label={notHelpfulLabel}
                    active={currentFeedback === "down"}
                    onClick={() => setFeedback("down")}
                  >
                    <ThumbsDownIcon className="size-3.5" />
                  </ResponseAction>
                </>
              ) : null}
              {hasSources ? (
                <button
                  data-slot="streaming-response-sources-trigger"
                  type="button"
                  aria-expanded={currentSourcesOpen}
                  aria-controls={sourcesContentId}
                  onClick={() => setSourcesOpen(!currentSourcesOpen)}
                  className="group ml-1 inline-flex min-h-7 items-center gap-2 rounded-md px-1.5 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CitationStack citations={sources} />
                  <span className="tabular-nums">
                    {sourcesLabel(sources.length)}
                  </span>
                  <motion.span
                    aria-hidden="true"
                    animate={{ rotate: currentSourcesOpen ? 180 : 0 }}
                    transition={reduced ? { duration: 0 } : SPRING_SWAP}
                    className="text-muted-foreground/50 group-hover:text-muted-foreground"
                  >
                    <ChevronDownIcon className="size-3" />
                  </motion.span>
                </button>
              ) : null}
            </div>

            {hasSources ? (
              <Disclosure id={sourcesContentId} open={currentSourcesOpen}>
                <CitationList
                  citations={sources}
                  idPrefix={resolvedSourcePrefix}
                  className="mt-2 rounded-xl bg-muted p-2"
                />
              </Disclosure>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export { StreamingResponse };
