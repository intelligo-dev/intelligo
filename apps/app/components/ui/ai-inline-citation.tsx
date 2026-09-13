"use client";

/*
 * A numbered marker in a reply
 * that reveals its source on hover or focus — the anatomy of Vercel AI
 * Elements' InlineCitation, authored on Base UI's HoverCard.
 */

import * as React from "react";
import { ExternalLinkIcon } from "lucide-react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

export type InlineCitationSource = {
  url?: string;
  title?: string;
  description?: string;
};

function InlineCitation({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="inline-citation"
      className={cn("inline-flex items-baseline", className)}
      {...props}
    />
  );
}

function InlineCitationCard({ children }: { children: React.ReactNode }) {
  return <HoverCard>{children}</HoverCard>;
}

/** The `[n]` marker. Focusable, so keyboard readers can open the card. */
function InlineCitationCardTrigger({
  index,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "children"> & {
  index: number;
  /** Accessible name, e.g. "Source 2". */
  label: string;
}) {
  return (
    <HoverCardTrigger
      delay={100}
      closeDelay={100}
      render={
        <button
          type="button"
          data-slot="inline-citation-trigger"
          aria-label={label}
          className={cn(
            "mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-muted px-1 align-super text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            className
          )}
          {...props}
        />
      }
    >
      {index}
    </HoverCardTrigger>
  );
}

function InlineCitationCardBody({
  className,
  ...props
}: React.ComponentProps<typeof HoverCardContent>) {
  return (
    <HoverCardContent
      data-slot="inline-citation-body"
      className={cn("w-72 p-3 text-sm", className)}
      {...props}
    />
  );
}

function InlineCitationSource({
  title,
  url,
  description,
  className,
  ...props
}: React.ComponentProps<"div"> & InlineCitationSource) {
  let host: string | null = null;
  if (url) {
    try {
      host = new URL(url).hostname;
    } catch {
      host = null;
    }
  }
  return (
    <div
      data-slot="inline-citation-source"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    >
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
        >
          <span className="truncate">{title ?? host ?? url}</span>
          <ExternalLinkIcon className="size-3 shrink-0" />
        </a>
      ) : (
        <span className="font-medium">{title}</span>
      )}
      {host && title ? (
        <span className="truncate text-xs text-muted-foreground">{host}</span>
      ) : null}
      {description ? (
        <p className="line-clamp-3 text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardTrigger,
  InlineCitationCardBody,
  InlineCitationSource,
};
