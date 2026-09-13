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
        "mono flex items-center gap-2 rounded-md border border-line bg-paper-sunken px-3 py-1.5 text-[0.74rem]",
        className
      )}
    >
      <span className="text-ink-faint">$</span>
      <span className="min-w-0 flex-1 truncate text-ink-dim">{cmd}</span>
      <CopyButton text={cmd} />
    </div>
  );
}
