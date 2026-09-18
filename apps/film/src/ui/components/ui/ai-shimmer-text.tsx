"use client";

/*
 * A status line that reads as alive while the agent works — the words swap
 * with a small motion, and a gradient sweeps over the text. The sweep
 * rides the theme's `shimmer` utility (keyframe, text clipping and the
 * reduced-motion reset all live there); this file only chooses the
 * gradient and the pace. Respects `prefers-reduced-motion`: the swap
 * becomes a plain replace and the utility drops the sweep.
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@ui/lib/utils";

/** The sweep: muted text with a foreground highlight passing through. */
const SHIMMER_GRADIENT =
  "linear-gradient(110deg, var(--muted-foreground) 30%, var(--foreground) 50%, var(--muted-foreground) 70%)";

/**
 * The custom properties the `shimmer` utility reads. Pair with the
 * `shimmer` class on any element that should carry the sweep.
 */
function shimmerStyle(
  /** Seconds taken for one pass; the utility's own default when omitted. */
  duration?: number,
  gradient: string = SHIMMER_GRADIENT,
): React.CSSProperties {
  const style: Record<string, string> = { "--shimmer-image": gradient };
  if (duration !== undefined) style["--shimmer-duration"] = `${duration}s`;
  return style as React.CSSProperties;
}

function ShimmerText({
  children,
  className,
  duration,
  gradient,
  style,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  /** The current status text; a change animates the swap. */
  children: string;
  /** Seconds taken for one shimmer pass. */
  duration?: number;
  /** A CSS image overriding the default token sweep. */
  gradient?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <span
      data-slot="shimmer-text"
      role="status"
      className={cn(
        "relative inline-grid overflow-hidden text-sm text-muted-foreground",
        className,
      )}
      style={style}
      {...props}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={children}
          className="shimmer col-start-1 row-start-1"
          style={shimmerStyle(duration, gradient)}
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

export { ShimmerText, shimmerStyle, SHIMMER_GRADIENT };
