"use client";

/*
 * A status line that reads as
 * alive while the agent works — the words swap with a small motion,
 * and the text shimmers. Respects `prefers-reduced-motion`: the swap
 * becomes a plain replace and the shimmer stays (it is a colour sweep,
 * not movement).
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

function ShimmerText({
  children,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  /** The current status text; a change animates the swap. */
  children: string;
}) {
  const reduced = useReducedMotion();

  return (
    <span
      data-slot="shimmer-text"
      role="status"
      className={cn(
        "relative inline-grid overflow-hidden text-sm text-muted-foreground",
        className
      )}
      {...props}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={children}
          className="shimmer col-start-1 row-start-1"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: reduced ? 0 : 0.18, ease: "easeOut" }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export { ShimmerText };
