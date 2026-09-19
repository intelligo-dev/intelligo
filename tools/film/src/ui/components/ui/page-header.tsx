import * as React from "react";

import { cn } from "@ui/lib/utils";

/**
 * The one page title every page renders: a heading, an optional
 * description, and actions that wrap under the heading on narrow screens.
 */
function PageHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-6 gap-y-3",
        className,
      )}
      {...props}
    />
  );
}

function PageHeaderContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-content"
      className={cn("flex min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

function PageHeaderTitle({
  className,
  level = 1,
  ...props
}: React.ComponentProps<"h1"> & {
  /**
   * 1 for the page's title; 2 for a section rendered under a layout that
   * already carries it (a settings tab under "Settings").
   */
  level?: 1 | 2;
}) {
  const Heading = level === 2 ? "h2" : "h1";
  return (
    <Heading
      data-slot="page-header-title"
      data-level={level}
      className={cn(
        "font-semibold tracking-tight text-balance",
        level === 2 ? "text-lg" : "text-2xl",
        className,
      )}
      {...props}
    />
  );
}

function PageHeaderDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-header-description"
      className={cn("max-w-prose text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function PageHeaderActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-actions"
      className={cn("flex shrink-0 flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

export {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderActions,
};
