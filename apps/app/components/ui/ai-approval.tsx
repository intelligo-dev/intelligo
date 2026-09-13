"use client";

/*
 * A human-in-the-loop decision:
 * what a tool is about to do, and allow / deny with an optional reason.
 * Authored for Base UI; labels are props, the outcome renders in a
 * status token.
 */

import * as React from "react";
import { CheckIcon, ShieldAlertIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ApprovalState = "requested" | "approved" | "denied";

function Approval({
  className,
  state = "requested",
  ...props
}: React.ComponentProps<"div"> & { state?: ApprovalState }) {
  return (
    <div
      data-slot="approval"
      data-state={state}
      className={cn(
        "flex w-full flex-col gap-3 rounded-lg border p-3 text-sm",
        state === "requested" && "border-warning/40 bg-warning/5",
        className
      )}
      {...props}
    />
  );
}

function ApprovalHeader({
  className,
  title,
  description,
  ...props
}: React.ComponentProps<"div"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <div
      data-slot="approval-header"
      className={cn("flex items-start gap-2", className)}
      {...props}
    >
      <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-medium">{title}</p>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

function ApprovalContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="approval-content"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function ApprovalReason({
  className,
  ...props
}: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      data-slot="approval-reason"
      className={cn("min-h-16 text-sm", className)}
      {...props}
    />
  );
}

function ApprovalActions({
  className,
  allowLabel,
  denyLabel,
  onAllow,
  onDeny,
  pending = false,
  ...props
}: React.ComponentProps<"div"> & {
  allowLabel: string;
  denyLabel: string;
  onAllow: () => void;
  onDeny: () => void;
  pending?: boolean;
}) {
  return (
    <div
      data-slot="approval-actions"
      className={cn("flex items-center justify-end gap-2", className)}
      {...props}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onDeny}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        <XIcon data-icon="inline-start" />
        {denyLabel}
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={onAllow}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        <CheckIcon data-icon="inline-start" />
        {allowLabel}
      </Button>
    </div>
  );
}

function ApprovalOutcome({
  state,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & { state: "approved" | "denied" }) {
  return (
    <div
      data-slot="approval-outcome"
      className={cn("flex items-center gap-2", className)}
      {...props}
    >
      <StatusBadge status={state === "approved" ? "success" : "warning"} dot>
        {children}
      </StatusBadge>
    </div>
  );
}

export {
  Approval,
  ApprovalHeader,
  ApprovalContent,
  ApprovalReason,
  ApprovalActions,
  ApprovalOutcome,
};
