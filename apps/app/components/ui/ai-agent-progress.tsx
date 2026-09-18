"use client";

/*
 * A long-running step: a 3×3
 * grid pulses in sequence beside the verb and an elapsed-time counter.
 * import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import { EASE_IN_OUT } from "@/components/ui/ai-motion";
import { cn } from "@/lib/utils";

const GRID_CELLS = [
  { id: "top-left", delay: 0 },
  { id: "top-center", delay: 0.14 },
  { id: "top-right", delay: 0.28 },
  { id: "middle-left", delay: 0.42 },
  { id: "middle-center", delay: 0.56 },
  { id: "middle-right", delay: 0.7 },
  { id: "bottom-left", delay: 0.84 },
  { id: "bottom-center", delay: 0.98 },
  { id: "bottom-right", delay: 1.12 },
];

export interface AgentProgressProps
  extends Omit<React.ComponentProps<"span">, "children"> {
  /** Verb describing the agent's current activity. */
  label?: string;
  /** Assistive-tech name; defaults to "{label}, in progress". */
  statusLabel?: string;
  /** Controlled elapsed time in seconds. */
  elapsedSeconds?: number;
  /** Starting time for the internal timer, in seconds. */
  initialSeconds?: number;
  /** Whether the internal timer should advance. Ignored when elapsedSeconds is provided. */
  running?: boolean;
  /** Renders the counter; "1m 4.2s" by default. */
  formatElapsed?: (totalSeconds: number) => string;
}

function defaultFormatElapsed(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = (safeSeconds % 60).toFixed(1);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function AgentProgress({
  label = "Churning",
  statusLabel,
  elapsedSeconds,
  initialSeconds = 0,
  running = true,
  formatElapsed = defaultFormatElapsed,
  className,
  ...props
}: AgentProgressProps) {
  const reduced = useReducedMotion() ?? false;
  const [internalSeconds, setInternalSeconds] = React.useState(initialSeconds);

  React.useEffect(() => {
    if (elapsedSeconds !== undefined || !running) return;

    const startedAt = performance.now() - initialSeconds * 1000;
    const timer = window.setInterval(() => {
      setInternalSeconds((performance.now() - startedAt) / 1000);
    }, 100);

    return () => window.clearInterval(timer);
  }, [elapsedSeconds, initialSeconds, running]);

  const elapsed = elapsedSeconds ?? internalSeconds;

  return (
    <span
      data-slot="agent-progress"
      role="status"
      aria-label={statusLabel ?? `${label}, in progress`}
      className={cn(
        "inline-flex items-center gap-3 font-mono text-sm text-muted-foreground",
        className
      )}
      {...props}
    >
      <span
        data-slot="agent-progress-grid"
        aria-hidden="true"
        className="grid size-5 shrink-0 grid-cols-3 gap-0.5"
      >
        {GRID_CELLS.map(({ id, delay }) => (
          <motion.span
            key={id}
            className="rounded-xs bg-current"
            animate={
              reduced
                ? { opacity: [0.35, 0.8, 0.35] }
                : {
                    opacity: [0.28, 1, 0.28],
                    scale: [0.72, 1, 0.72],
                  }
            }
            transition={{
              duration: 1.55,
              ease: EASE_IN_OUT,
              repeat: Infinity,
              delay,
            }}
          />
        ))}
      </span>
      <span data-slot="agent-progress-label" className="font-sans font-medium">
        {label}
      </span>
      <span
        data-slot="agent-progress-elapsed"
        aria-hidden="true"
        className="tabular-nums text-muted-foreground/70"
      >
        {formatElapsed(elapsed)}
      </span>
    </span>
  );
}

export { AgentProgress };
