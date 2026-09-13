"use client";

/*
 * 
 */

import * as React from "react";
import { type LucideIcon, XIcon } from "lucide-react";

import { Button } from "@showcase/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@showcase/components/ui/tooltip";
import { cn } from "@showcase/lib/utils";

// Changes: base-nova Button sizes instead of size overrides; the tooltip
// composes through render; close and action labels are required props.

function Artifact({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="artifact"
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-background shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function ArtifactHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="artifact-header"
      className={cn(
        "flex items-center justify-between gap-2 border-b bg-muted/50 px-4 py-3",
        className
      )}
      {...props}
    />
  );
}

function ArtifactTitle({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="artifact-title"
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}

function ArtifactDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="artifact-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function ArtifactActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="artifact-actions"
      className={cn("flex items-center gap-1", className)}
      {...props}
    />
  );
}

function ArtifactClose({
  label,
  children,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: React.ComponentProps<typeof Button> & {
  /** Accessible name, e.g. "Close". */
  label: string;
}) {
  return (
    <Button
      data-slot="artifact-close"
      aria-label={label}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children ?? <XIcon />}
    </Button>
  );
}

function ArtifactAction({
  label,
  tooltip,
  icon: Icon,
  children,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: React.ComponentProps<typeof Button> & {
  /** Accessible name. */
  label: string;
  /** Shown on hover and focus when given. */
  tooltip?: string;
  icon?: LucideIcon;
}) {
  const button = (
    <Button
      data-slot="artifact-action"
      aria-label={label}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {Icon ? <Icon /> : children}
    </Button>
  );

  if (!tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function ArtifactContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="artifact-content"
      className={cn("flex-1 overflow-auto p-4", className)}
      {...props}
    />
  );
}

export {
  Artifact,
  ArtifactHeader,
  ArtifactTitle,
  ArtifactDescription,
  ArtifactActions,
  ArtifactClose,
  ArtifactAction,
  ArtifactContent,
};
