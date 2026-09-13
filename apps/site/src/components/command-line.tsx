import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/copy-button";

/** A one-line shell command with a copy button. Needs a TooltipProvider above it. */
export function CommandLine({
  cmd,
  className,
}: {
  cmd: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mono flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5 text-[0.74rem]",
        className
      )}
    >
      <span className="text-muted-foreground">$</span>
      <span className="min-w-0 flex-1 truncate text-foreground/70">{cmd}</span>
      <CopyButton text={cmd} />
    </div>
  );
}
