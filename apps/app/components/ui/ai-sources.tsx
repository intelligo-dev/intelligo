"use client";

/*
 * 
 */

import * as React from "react";
import { BookIcon, ChevronDownIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// Changes: the trigger's text is its children (upstream defaulted to
// English); links underline on hover and icons size with size-*.

function Sources({
  className,
  ...props
}: React.ComponentProps<typeof Collapsible>) {
  return (
    <Collapsible
      data-slot="sources"
      className={cn("text-xs", className)}
      {...props}
    />
  );
}

function SourcesTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger>) {
  return (
    <CollapsibleTrigger
      data-slot="sources-trigger"
      className={cn(
        "group/sources-trigger flex items-center gap-2 font-medium text-primary",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon className="size-4 transition-transform group-data-panel-open/sources-trigger:rotate-180" />
    </CollapsibleTrigger>
  );
}

function SourcesContent({
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="sources-content"
      className={cn("mt-3 flex w-fit flex-col gap-2", className)}
      {...props}
    />
  );
}

function Source({
  href,
  title,
  children,
  className,
  ...props
}: React.ComponentProps<"a">) {
  return (
    <a
      data-slot="source"
      className={cn(
        "flex items-center gap-2 text-primary underline-offset-4 hover:underline",
        className
      )}
      href={href}
      rel="noreferrer"
      target="_blank"
      {...props}
    >
      {children ?? (
        <>
          <BookIcon className="size-4" />
          <span className="font-medium">{title}</span>
        </>
      )}
    </a>
  );
}

export { Sources, SourcesTrigger, SourcesContent, Source };
