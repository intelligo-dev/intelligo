"use client";

/*
 * A plan the agent is working
 * through — the shape of Vercel AI Elements' Task, authored for Base UI
 * with status tokens and labels passed in.
 */

import * as React from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  ListChecksIcon,
  XIcon,
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@showcase/components/ui/collapsible";
import { Spinner } from "@showcase/components/ui/spinner";
import { cn } from "@showcase/lib/utils";

export type TaskItemStatus = "pending" | "in_progress" | "done" | "failed";

function Task({
  className,
  defaultOpen = true,
  ...props
}: React.ComponentProps<typeof Collapsible>) {
  return (
    <Collapsible
      data-slot="task"
      defaultOpen={defaultOpen}
      className={cn("w-full rounded-lg border text-sm", className)}
      {...props}
    />
  );
}

function TaskTrigger({
  className,
  title,
  progress,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
  title: React.ReactNode;
  /** e.g. "2 of 5 done". */
  progress?: React.ReactNode;
}) {
  return (
    <CollapsibleTrigger
      data-slot="task-trigger"
      className={cn(
        "group/task-trigger flex w-full items-center justify-between gap-3 px-3 py-2 text-left",
        className
      )}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2">
        <ListChecksIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{title}</span>
        {progress ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {progress}
          </span>
        ) : null}
      </span>
      <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open/task-trigger:rotate-180" />
    </CollapsibleTrigger>
  );
}

function TaskContent({
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="task-content"
      className={cn("border-t px-3 py-2", className)}
      {...props}
    />
  );
}

function TaskItems({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="task-items"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

const ITEM_CLASS: Record<TaskItemStatus, string> = {
  pending: "text-muted-foreground",
  in_progress: "text-info",
  done: "text-success",
  failed: "text-destructive",
};

function ItemIcon({ status }: { status: TaskItemStatus }) {
  if (status === "in_progress") return <Spinner className="size-3.5" />;
  if (status === "done") return <CheckIcon className="size-3.5" />;
  if (status === "failed") return <XIcon className="size-3.5" />;
  return <CircleIcon className="size-3.5" />;
}

function TaskItem({
  className,
  status = "pending",
  statusLabel,
  children,
  ...props
}: React.ComponentProps<"li"> & {
  status?: TaskItemStatus;
  /** The state, for assistive tech. */
  statusLabel?: string;
}) {
  return (
    <li
      data-slot="task-item"
      data-status={status}
      className={cn("flex items-start gap-2", className)}
      {...props}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center",
          ITEM_CLASS[status]
        )}
        aria-hidden
      >
        <ItemIcon status={status} />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1",
          status === "done" && "text-muted-foreground line-through"
        )}
      >
        {children}
      </span>
      {statusLabel ? <span className="sr-only">{statusLabel}</span> : null}
    </li>
  );
}

export { Task, TaskTrigger, TaskContent, TaskItems, TaskItem };
