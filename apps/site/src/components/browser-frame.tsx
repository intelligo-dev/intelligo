import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The fake browser chrome a live registry scene renders inside. */
export function BrowserFrame({
  path = "app/[en]/…",
  messages,
  className,
  bodyClassName,
  children,
}: {
  path?: string;
  /** The item's messages file, shown on the right of the bar. */
  messages?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("border border-line-strong bg-paper-raised", className)}>
      <div className="flex h-7 items-center gap-1.5 border-b border-line px-3">
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="mono ml-2 truncate text-[0.66rem] text-ink-faint">
          {path}
        </span>
        {messages && (
          <span className="mono ml-auto hidden truncate text-[0.62rem] text-ink-faint sm:inline">
            {messages}
          </span>
        )}
      </div>
      <div className={cn("relative overflow-hidden", bodyClassName)}>
        {children}
      </div>
    </div>
  );
}
