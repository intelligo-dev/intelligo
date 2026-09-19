import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The fake browser chrome a live registry scene renders inside. */
export function BrowserFrame({
  path = "app/[en]/…",
  messages,
  className,
  bodyClassName,
  label,
  children,
}: {
  path?: string;
  /** The item's messages file, shown on the right of the bar. */
  messages?: string;
  className?: string;
  bodyClassName?: string;
  /** What the scene shows, for a reader who cannot see it. */
  label?: string;
  children: ReactNode;
}) {
  return (
    <figure
      aria-label={label}
      className={cn(
        "m-0 overflow-hidden rounded-xl border border-foreground/15 bg-card",
        className
      )}
    >
      <div
        aria-hidden="true"
        className="flex h-7 items-center gap-1.5 border-b border-border px-3"
      >
        <span className="size-2 rounded-full bg-foreground/15" />
        <span className="size-2 rounded-full bg-foreground/15" />
        <span className="size-2 rounded-full bg-foreground/15" />
        <span className="mono ml-2 truncate text-[0.7rem] text-muted-foreground">
          {path}
        </span>
        {messages && (
          <span className="mono ml-auto hidden truncate text-[0.7rem] text-muted-foreground sm:inline">
            {messages}
          </span>
        )}
      </div>
      <div className={cn("relative overflow-hidden", bodyClassName)}>
        {children}
      </div>
    </figure>
  );
}
