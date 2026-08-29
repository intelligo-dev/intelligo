import { CopyButton } from "@/components/copy-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** One shell command with a copy button — hydrated as a single island. */
export function InstallCommand({ cmd, className }: { cmd: string; className?: string }) {
  return (
    <TooltipProvider>
      <div className={cn("mono flex items-center gap-2 rounded-md border border-line bg-paper-sunken px-3 py-2 text-[0.78rem]", className)}>
        <span className="text-ink-faint">$</span>
        <span className="min-w-0 flex-1 truncate text-ink">{cmd}</span>
        <CopyButton text={cmd} />
      </div>
    </TooltipProvider>
  );
}
