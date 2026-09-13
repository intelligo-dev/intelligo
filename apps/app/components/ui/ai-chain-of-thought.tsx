"use client";

/*
 * The anatomy follows Vercel AI
 * Elements' ChainOfThought — a collapsible list of steps with a status
 * each — authored for Base UI: `render` composition, status tokens,
 * every label passed in.
 */

import * as React from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  ListTreeIcon,
  XIcon,
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type ChainOfThoughtStepStatus =
  | "pending"
  | "active"
  | "complete"
  | "error";

function ChainOfThought({
  className,
  ...props
}: React.ComponentProps<typeof Collapsible>) {
  return (
    <Collapsible
      data-slot="chain-of-thought"
      className={cn("w-full rounded-lg border text-sm", className)}
      {...props}
    />
  );
}

function ChainOfThoughtHeader({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger>) {
  return (
    <CollapsibleTrigger
      data-slot="chain-of-thought-header"
      className={cn(
        "group/cot-header flex w-full items-center justify-between gap-3 px-3 py-2 text-left",
        className
      )}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <ListTreeIcon className="size-4 shrink-0" />
        <span className="truncate font-medium text-foreground">{children}</span>
      </span>
      <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open/cot-header:rotate-180" />
    </CollapsibleTrigger>
  );
}

function ChainOfThoughtContent({
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="chain-of-thought-content"
      className={cn("border-t px-3 py-2", className)}
      {...props}
    />
  );
}

function ChainOfThoughtSteps({
  className,
  ...props
}: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="chain-of-thought-steps"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

const STATUS_CLASS: Record<ChainOfThoughtStepStatus, string> = {
  pending: "text-muted-foreground",
  active: "text-info",
  complete: "text-success",
  error: "text-destructive",
};

function StatusIcon({ status }: { status: ChainOfThoughtStepStatus }) {
  if (status === "active") return <Spinner className="size-3.5" />;
  if (status === "complete") return <CheckIcon className="size-3.5" />;
  if (status === "error") return <XIcon className="size-3.5" />;
  return <CircleIcon className="size-3.5" />;
}

function ChainOfThoughtStep({
  className,
  status = "complete",
  label,
  description,
  statusLabel,
  children,
  ...props
}: Omit<React.ComponentProps<"li">, "children"> & {
  status?: ChainOfThoughtStepStatus;
  label: React.ReactNode;
  description?: React.ReactNode;
  /** The state, for assistive tech, e.g. "Running". */
  statusLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <li
      data-slot="chain-of-thought-step"
      data-status={status}
      className={cn("flex gap-2", className)}
      {...props}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center",
          STATUS_CLASS[status]
        )}
        aria-hidden
      >
        <StatusIcon status={status} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate font-medium">{label}</span>
          {statusLabel ? (
            <span className="sr-only">{statusLabel}</span>
          ) : null}
        </div>
        {description ? (
          <div className="text-xs text-muted-foreground">{description}</div>
        ) : null}
        {children}
      </div>
    </li>
  );
}

function ChainOfThoughtSearchResults({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="chain-of-thought-search-results"
      className={cn("flex flex-wrap gap-1.5", className)}
      {...props}
    />
  );
}

function ChainOfThoughtSearchResult({
  className,
  href,
  ...props
}: React.ComponentProps<"a">) {
  return (
    <a
      data-slot="chain-of-thought-search-result"
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full border bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground",
        className
      )}
      href={href}
      rel="noreferrer"
      target="_blank"
      {...props}
    />
  );
}

export {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtSteps,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
};
