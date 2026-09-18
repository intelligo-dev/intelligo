import { CopyButton } from "@/components/copy-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** One shell command with a copy button — hydrated as a single island. */
export function InstallCommand({
  cmd,
  className,
}: {
  cmd: string;
  className?: string;
}) {
  return (
    <TooltipProvider>
      <div
        className={cn(
          "mono flex items-center gap-2 rounded-md border border-border bg-muted py-1 pl-3 pr-1 text-[0.78rem]",
          className
        )}
      >
        <span className="text-muted-foreground">$</span>
        {/* scrolls rather than truncates: a command is read before it is run */}
      <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] text-foreground">
        {cmd}
      </span>
        <CopyButton text={cmd} />
      </div>
    </TooltipProvider>
  );
}
