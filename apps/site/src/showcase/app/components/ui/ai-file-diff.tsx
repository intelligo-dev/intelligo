"use client";

/*
 * A file the agent is changing — the path with live added/removed counts,
 * opening onto a unified diff whose rows arrive one by one while the
 * change streams. Rows are highlighted through the shared shiki tokens.
 */

import * as React from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FileCode2Icon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import {
  CodeLine,
  type CodeLanguage,
  useCodeTokens,
} from "@showcase/components/ui/ai-code-block";
import { Disclosure, SPRING_SWAP } from "@showcase/components/ui/ai-motion";
import { Button } from "@showcase/components/ui/button";
import { Spinner } from "@showcase/components/ui/spinner";
import { cn } from "@showcase/lib/utils";

export type FileDiffStatus = "streaming" | "complete";
export type FileDiffLineType = "added" | "removed" | "context";

export interface FileDiffLine {
  /** Stable across renders, so a streamed row never remounts. */
  id: string;
  type?: FileDiffLineType;
  oldLine?: number;
  newLine?: number;
  content: string;
}

export interface FileDiffProps
  extends Omit<React.ComponentProps<"div">, "children"> {
  /** The file's path. */
  file: React.ReactNode;
  lines: FileDiffLine[];
  status?: FileDiffStatus;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Close the diff once the change is applied; a new stream opens it. */
  collapseOnComplete?: boolean;
  /** Pixel height the diff scrolls within. */
  maxHeight?: number;
  language?: CodeLanguage;
  /** Text the copy action writes; `onCopy` takes over when given. */
  copyText?: string;
  onCopy?: () => void | Promise<void>;
  statusLabels?: Partial<Record<FileDiffStatus, string>>;
  copyLabel?: string;
  copiedLabel?: string;
  /** The `sr-only` heading of the rows. */
  changesLabel?: string;
}

const STATUS_LABELS: Record<FileDiffStatus, string> = {
  streaming: "Applying changes",
  complete: "Changes applied",
};

/** The `color-scheme` switch the token colours read through. */
const SCHEME = "[color-scheme:light] dark:[color-scheme:dark]";

function ChangeCount({
  value,
  type,
}: {
  value: number;
  type: "added" | "removed";
}) {
  if (!value) return null;
  return (
    <span
      data-slot="file-diff-count"
      data-type={type}
      className={cn(
        "font-mono text-xs tabular-nums",
        type === "added" ? "text-success" : "text-destructive"
      )}
    >
      {type === "added" ? "+" : "−"}
      {value}
    </span>
  );
}

function FileDiff({
  file,
  lines,
  status = "streaming",
  open,
  defaultOpen = true,
  onOpenChange,
  collapseOnComplete = true,
  maxHeight = 220,
  language = "typescript",
  copyText,
  onCopy,
  className,
  statusLabels,
  copyLabel = "Copy diff",
  copiedLabel = "Copied",
  changesLabel = "File changes",
  ...props
}: FileDiffProps) {
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
  const streaming = status === "streaming";
  const additions = lines.filter((line) => line.type === "added").length;
  const deletions = lines.filter((line) => line.type === "removed").length;
  const canCopy = Boolean(copyText || onCopy);
  const labels = { ...STATUS_LABELS, ...statusLabels };
  const code = lines.map((line) => line.content).join("\n");
  const tokens = useCodeTokens(code, language);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (open === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange, open]
  );

  React.useEffect(() => {
    if (previousStatus.current !== "streaming" && status === "streaming") {
      setOpen(true);
    }
    if (
      previousStatus.current === "streaming" &&
      status === "complete" &&
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

  // While the change streams the viewport follows the newest row.
  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !currentOpen || !streaming) return;

    const frame = requestAnimationFrame(() => {
      if (viewport.scrollHeight <= viewport.clientHeight) return;
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
      data-slot="file-diff"
      data-state={status}
      aria-busy={streaming || undefined}
      className={cn("w-full text-sm", className)}
      {...props}
    >
      <button
        id={triggerId}
        type="button"
        data-slot="file-diff-trigger"
        aria-expanded={currentOpen}
        aria-controls={contentId}
        onClick={() => setOpen(!currentOpen)}
        className="group/file-diff flex min-h-9 w-full items-center gap-2 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <FileCode2Icon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">
          {file}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <ChangeCount value={additions} type="added" />
          <ChangeCount value={deletions} type="removed" />
        </span>
        <span
          data-slot="file-diff-status"
          className="grid size-4 shrink-0 place-items-center text-muted-foreground/60"
        >
          {streaming ? (
            <Spinner className="size-3.5" aria-label={labels.streaming} />
          ) : (
            <CheckIcon aria-label={labels.complete} className="size-3.5" />
          )}
        </span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: currentOpen ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : SPRING_SWAP}
          className="shrink-0 text-muted-foreground/45 transition-colors group-hover/file-diff:text-muted-foreground"
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
            data-slot="file-diff-panel"
            className="overflow-hidden rounded-xl bg-muted/80"
          >
            <div
              ref={viewportRef}
              data-slot="file-diff-viewport"
              aria-live="polite"
              className={cn(
                "overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                SCHEME
              )}
              style={{ maxHeight }}
            >
              <div className="font-mono text-xs leading-5">
                <span className="sr-only">{changesLabel}</span>
                {lines.map((line, index) => {
                  const type = line.type ?? "context";
                  return (
                    <div
                      key={line.id}
                      data-slot="file-diff-line"
                      data-type={type}
                      className={cn(
                        "grid",
                        type === "added" && "bg-success/10",
                        type === "removed" && "bg-destructive/10"
                      )}
                      style={{
                        gridTemplateColumns:
                          "2.25rem 2.25rem 1rem minmax(0, 1fr)",
                      }}
                    >
                      <span className="pr-2 text-right text-muted-foreground/40 tabular-nums select-none">
                        {line.oldLine}
                      </span>
                      <span className="pr-2 text-right text-muted-foreground/40 tabular-nums select-none">
                        {line.newLine}
                      </span>
                      <span
                        className={cn(
                          "text-center text-muted-foreground/45 select-none",
                          type === "added" && "text-success",
                          type === "removed" && "text-destructive"
                        )}
                      >
                        {type === "added" ? "+" : type === "removed" ? "−" : ""}
                      </span>
                      <CodeLine
                        code={line.content}
                        tokens={tokens?.[index]}
                        className="min-w-0 px-1.5 whitespace-pre"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {canCopy ? (
              <div
                data-slot="file-diff-actions"
                className="flex justify-end px-2 pt-1 pb-1.5"
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={copied ? copiedLabel : copyLabel}
                  title={copied ? copiedLabel : copyLabel}
                  onClick={handleCopy}
                  className="text-muted-foreground"
                >
                  {copied ? (
                    <CheckIcon className="size-3.5" />
                  ) : (
                    <CopyIcon className="size-3.5" />
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </Disclosure>
    </div>
  );
}

export { FileDiff };
