"use client";

/*
 * 
 */

import * as React from "react";
import type { ToolUIPart } from "ai";
import { ChevronDownIcon, WrenchIcon } from "lucide-react";

import { CodeBlock } from "@showcase/components/ui/ai-code-block";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@showcase/components/ui/collapsible";
import { StatusBadge } from "@showcase/components/ui/status-badge";
import { cn } from "@showcase/lib/utils";

// Changes: the state shows as a T4 status-badge in a status token (upstream
// used palette colours); every label is passed in, so nothing is English by
// default; headings drop uppercase tracking.

type ToolState = ToolUIPart["state"];

const STATUS_BY_STATE: Record<
  string,
  "neutral" | "info" | "success" | "warning" | "destructive"
> = {
  "input-streaming": "neutral",
  "input-available": "info",
  "approval-requested": "warning",
  "approval-responded": "info",
  "output-available": "success",
  "output-error": "destructive",
  "output-denied": "warning",
};

function Tool({
  className,
  ...props
}: React.ComponentProps<typeof Collapsible>) {
  return (
    <Collapsible
      data-slot="tool"
      className={cn("w-full rounded-lg border", className)}
      {...props}
    />
  );
}

function ToolHeader({
  className,
  title,
  type,
  state,
  stateLabel,
  ...props
}: Omit<React.ComponentProps<typeof CollapsibleTrigger>, "type"> & {
  title?: string;
  type: ToolUIPart["type"];
  state: ToolState;
  /** The translated name of the state, e.g. "Running". */
  stateLabel: string;
}) {
  return (
    <CollapsibleTrigger
      data-slot="tool-header"
      className={cn(
        "group/tool-header flex w-full items-center justify-between gap-4 p-3 text-left",
        className
      )}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2">
        <WrenchIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">
          {title ?? type.split("-").slice(1).join("-")}
        </span>
        <StatusBadge status={STATUS_BY_STATE[state] ?? "neutral"} dot>
          {stateLabel}
        </StatusBadge>
      </span>
      <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open/tool-header:rotate-180" />
    </CollapsibleTrigger>
  );
}

function ToolContent({
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="tool-content"
      className={cn("overflow-hidden text-popover-foreground", className)}
      {...props}
    />
  );
}

function ToolInput({
  className,
  input,
  label,
  ...props
}: React.ComponentProps<"div"> & {
  input: ToolUIPart["input"];
  /** Heading above the input, e.g. "Parameters". */
  label: string;
}) {
  return (
    <div
      data-slot="tool-input"
      className={cn("space-y-2 overflow-hidden p-4", className)}
      {...props}
    >
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <CodeBlock
        code={JSON.stringify(input, null, 2)}
        language="json"
        className="bg-muted/50"
      />
    </div>
  );
}

function ToolOutput({
  className,
  output,
  errorText,
  label,
  ...props
}: React.ComponentProps<"div"> & {
  output: ToolUIPart["output"];
  errorText: ToolUIPart["errorText"];
  /** Heading above the output, e.g. "Result" or "Error". */
  label: string;
}) {
  if (!(output || errorText)) return null;

  let body: React.ReactNode;
  if (errorText) {
    body = <div className="p-3 text-sm">{errorText}</div>;
  } else if (typeof output === "string") {
    body = <CodeBlock code={output} language="json" />;
  } else if (React.isValidElement(output)) {
    body = output;
  } else {
    body = <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />;
  }

  return (
    <div
      data-slot="tool-output"
      className={cn("space-y-2 p-4", className)}
      {...props}
    >
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs",
          errorText ? "bg-destructive/10 text-destructive" : "text-foreground"
        )}
      >
        {body}
      </div>
    </div>
  );
}

export { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput };
