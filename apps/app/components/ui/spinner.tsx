import * as React from "react";

import { cn } from "@/lib/utils";

function Spinner({
  className,
  label,
  ...props
}: React.ComponentProps<"svg"> & {
  /** What is loading, in the reader's language; omit when decorative. */
  label?: string;
}) {
  const name = label ?? props["aria-label"];
  return (
    <svg
      data-slot="spinner"
      role={name ? "status" : undefined}
      aria-hidden={name ? undefined : true}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      className={cn("size-4 animate-spin", className)}
      {...props}
      aria-label={name}
    >
      <circle cx="12" cy="12" r="9" className="opacity-20" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

export { Spinner };
