import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * A status in a status token — never a palette colour.
 * Map a domain state to one of five statuses where the state is known;
 * the badge only knows how each status looks, so re-valuing
 * --success/--warning/--info/--destructive re-themes every badge.
 */
const statusBadgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center gap-1.5 overflow-hidden rounded-4xl px-2 text-xs font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3 [&>svg]:shrink-0",
  {
    variants: {
      status: {
        neutral: "bg-muted text-muted-foreground",
        info: "bg-info/10 text-info",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        destructive: "bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      status: "neutral",
    },
  }
);

function StatusBadge({
  className,
  status = "neutral",
  dot = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof statusBadgeVariants> & {
    /** A leading dot in the status colour. */
    dot?: boolean;
  }) {
  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={cn(statusBadgeVariants({ status }), className)}
      {...props}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-current"
        />
      )}
      {children}
    </span>
  );
}

export { StatusBadge, statusBadgeVariants };
