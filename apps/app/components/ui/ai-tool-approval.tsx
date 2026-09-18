"use client";

/*
 * A permission card: the tool an agent wants to run, its parameters behind
 * a disclosure, and allow once / always allow / deny, with the outcome
 * shown as a status.
 */

import * as React from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { CodeBlock } from "@/components/ui/ai-code-block";
import {
  Disclosure,
  EASE_OUT,
  SPRING_PRESS,
  SPRING_SWAP,
} from "@/components/ui/ai-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type ToolApprovalStatus =
  | "pending"
  | "approving"
  | "approved"
  | "denied"
  | "running"
  | "complete"
  | "error";

export interface ToolApprovalParameter {
  id: string;
  label: React.ReactNode;
  value: React.ReactNode;
}

const DEFAULT_STATUS_LABELS: Record<ToolApprovalStatus, string> = {
  pending: "Approval required",
  approving: "Approving",
  approved: "Approved",
  denied: "Denied",
  running: "Running",
  complete: "Completed",
  error: "Failed",
};

const BADGE_CLASS: Record<ToolApprovalStatus, string> = {
  pending: "border-warning/30 bg-warning/10 text-warning",
  approving: "border-info/30 bg-info/10 text-info",
  running: "border-info/30 bg-info/10 text-info",
  approved: "border-success/30 bg-success/10 text-success",
  complete: "border-success/30 bg-success/10 text-success",
  denied: "border-destructive/30 bg-destructive/10 text-destructive",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
};

/* ----------------------------------------------------------------------------
 * ToolApprovalCode: a parameter value that is code (a shell command, a
 * JSON payload), highlighted through the shared code block.
 * ------------------------------------------------------------------------- */

type CodeBlockProps = React.ComponentProps<typeof CodeBlock>;

export type ToolApprovalCodeProps = Omit<CodeBlockProps, "language"> & {
  language?: CodeBlockProps["language"];
};

function ToolApprovalCode({
  language = "bash",
  className,
  ...props
}: ToolApprovalCodeProps) {
  return (
    <CodeBlock
      language={language}
      className={cn(
        // Parameter values sit in a narrow grid column with nowhere to scroll
        // on touch, so they wrap instead of clipping.
        "border-border/50 bg-muted/30 text-xs [&_code]:text-xs! [&_pre]:p-2.5! [&_pre]:text-xs! [&_pre]:leading-5 [&_pre]:break-words [&_pre]:whitespace-pre-wrap",
        className
      )}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------------------
 * ToolApproval: the card.
 * ------------------------------------------------------------------------- */

export interface ToolApprovalProps
  extends Omit<React.ComponentProps<"div">, "title"> {
  /** The tool's name, shown in monospace under the title. */
  tool: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  parameters?: ToolApprovalParameter[];
  status?: ToolApprovalStatus;
  /** Whether the parameter details are shown (controlled). */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** `remember` is true when the user chose "Always allow". */
  onAllow?: (remember: boolean) => void;
  /** `reason` is set only when `denyReason` is on and the user typed one. */
  onDeny?: (reason?: string) => void;
  /** Offer "Always allow" beside "Allow once". */
  alwaysAllow?: boolean;
  /** Ask for an optional reason before denying. */
  denyReason?: boolean;
  allowOnceLabel?: string;
  alwaysAllowLabel?: string;
  denyLabel?: string;
  cancelLabel?: string;
  detailsLabel?: string;
  denyReasonPlaceholder?: string;
  statusLabels?: Partial<Record<ToolApprovalStatus, string>>;
}

function StatusIcon({
  status,
  busy,
}: {
  status: ToolApprovalStatus;
  busy: boolean;
}) {
  if (busy) return <Spinner className="size-4" />;
  if (status === "error") return <CircleAlertIcon className="size-4" />;
  if (status === "denied") return <XIcon className="size-4" />;
  if (status === "approved" || status === "complete") {
    return <CheckIcon className="size-4" />;
  }
  return <ShieldCheckIcon className="size-4" />;
}

function ToolApproval({
  tool,
  title = "Allow this tool to run?",
  description,
  parameters = [],
  status = "pending",
  open,
  defaultOpen = false,
  onOpenChange,
  onAllow,
  onDeny,
  alwaysAllow = false,
  denyReason = false,
  allowOnceLabel = "Allow once",
  alwaysAllowLabel = "Always allow",
  denyLabel = "Deny",
  cancelLabel = "Cancel",
  detailsLabel = "View details",
  denyReasonPlaceholder = "Reason (optional)",
  statusLabels,
  className,
  ...props
}: ToolApprovalProps) {
  const reduced = useReducedMotion() ?? false;
  const baseId = React.useId();
  const detailsId = `${baseId}-details`;
  const previousStatus = React.useRef(status);
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const [denying, setDenying] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const currentOpen = open ?? internalOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (open === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange, open]
  );
  const busy = status === "approving" || status === "running";
  const pending = status === "pending";
  const error = status === "error";
  const statusLabel = statusLabels?.[status] ?? DEFAULT_STATUS_LABELS[status];

  // Once a decision lands the details fold away; the card reads as a receipt.
  React.useEffect(() => {
    if (previousStatus.current === "pending" && status !== "pending") {
      setOpen(false);
      setDenying(false);
    }
    previousStatus.current = status;
  }, [setOpen, status]);

  const submitDeny = () => {
    const trimmed = reason.trim();
    onDeny?.(trimmed ? trimmed : undefined);
  };

  return (
    <div
      data-slot="tool-approval"
      data-state={status}
      aria-busy={busy || undefined}
      className={cn(
        "w-full overflow-hidden rounded-xl border bg-card text-sm",
        className
      )}
      {...props}
    >
      <div data-slot="tool-approval-header" className="flex items-start gap-2.5 p-3">
        <span
          data-slot="tool-approval-icon"
          aria-hidden="true"
          className={cn(
            "mt-0.5 grid size-4 shrink-0 place-items-center text-muted-foreground",
            error && "text-destructive"
          )}
        >
          <StatusIcon status={status} busy={busy} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                data-slot="tool-approval-title"
                className="leading-5 font-medium text-foreground"
              >
                {title}
              </div>
              {description ? (
                <p
                  data-slot="tool-approval-description"
                  className="mt-0.5 leading-5 text-muted-foreground"
                >
                  {description}
                </p>
              ) : (
                <div
                  data-slot="tool-approval-tool"
                  className="mt-0.5 truncate font-mono text-xs text-muted-foreground"
                >
                  {tool}
                </div>
              )}
            </div>
            {pending ? null : (
              <span
                data-slot="tool-approval-status"
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                  BADGE_CLASS[status]
                )}
              >
                {statusLabel}
              </span>
            )}
          </div>

          {parameters.length ? (
            <button
              type="button"
              data-slot="tool-approval-details-trigger"
              aria-expanded={currentOpen}
              aria-controls={detailsId}
              onClick={() => setOpen(!currentOpen)}
              className="mt-2 inline-flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {detailsLabel}
              <motion.span
                aria-hidden="true"
                animate={{ rotate: currentOpen ? 180 : 0 }}
                transition={reduced ? { duration: 0 } : SPRING_SWAP}
              >
                <ChevronDownIcon className="size-3.5" />
              </motion.span>
            </button>
          ) : null}
        </div>
      </div>

      <Disclosure id={detailsId} open={currentOpen}>
        <dl
          data-slot="tool-approval-details"
          className="mx-3 mb-3 grid gap-2 rounded-lg bg-muted/60 p-3"
        >
          {parameters.map((parameter) => (
            <div
              key={parameter.id}
              data-slot="tool-approval-parameter"
              className="grid items-center gap-3 text-xs"
              style={{ gridTemplateColumns: "minmax(0, 7rem) minmax(0, 1fr)" }}
            >
              <dt className="text-muted-foreground">{parameter.label}</dt>
              <dd className="min-w-0 font-mono break-words text-foreground/85">
                {parameter.value}
              </dd>
            </div>
          ))}
        </dl>
      </Disclosure>

      <AnimatePresence initial={false}>
        {pending ? (
          <motion.div
            data-slot="tool-approval-actions"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.22, ease: EASE_OUT }}
            className="flex flex-wrap items-center justify-end gap-2 px-3 pb-3"
          >
            {denying ? (
              <form
                data-slot="tool-approval-deny-reason"
                className="flex w-full flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitDeny();
                }}
              >
                <Input
                  autoFocus
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={denyReasonPlaceholder}
                  aria-label={denyReasonPlaceholder}
                  className="min-w-0 flex-1 text-xs"
                />
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                >
                  {denyLabel}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setDenying(false)}
                >
                  {cancelLabel}
                </Button>
              </form>
            ) : (
              <>
                <motion.span
                  className="inline-flex"
                  whileTap={reduced ? undefined : { scale: 0.97 }}
                  transition={SPRING_PRESS}
                >
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onAllow?.(false)}
                  >
                    {allowOnceLabel}
                  </Button>
                </motion.span>
                {alwaysAllow ? (
                  <motion.span
                    className="inline-flex"
                    whileTap={reduced ? undefined : { scale: 0.97 }}
                    transition={SPRING_PRESS}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onAllow?.(true)}
                    >
                      {alwaysAllowLabel}
                    </Button>
                  </motion.span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    if (denyReason) setDenying(true);
                    else onDeny?.();
                  }}
                >
                  {denyLabel}
                </Button>
              </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export { ToolApproval, ToolApprovalCode };
