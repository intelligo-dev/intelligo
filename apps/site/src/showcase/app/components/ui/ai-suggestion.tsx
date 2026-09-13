"use client";

/*
 * 
 */

import * as React from "react";

import { Button } from "@showcase/components/ui/button";
import { ScrollArea, ScrollBar } from "@showcase/components/ui/scroll-area";
import { cn } from "@showcase/lib/utils";

// Changes: base-nova Button and ScrollArea; no cursor override.

function Suggestions({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollArea>) {
  return (
    <ScrollArea
      data-slot="suggestions"
      className="w-full whitespace-nowrap"
      {...props}
    >
      <div
        className={cn("flex w-max flex-nowrap items-center gap-2", className)}
      >
        {children}
      </div>
      <ScrollBar className="hidden" orientation="horizontal" />
    </ScrollArea>
  );
}

function Suggestion({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
}) {
  return (
    <Button
      data-slot="suggestion"
      className={cn("rounded-full px-4", className)}
      onClick={() => onClick?.(suggestion)}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children || suggestion}
    </Button>
  );
}

export { Suggestions, Suggestion };
