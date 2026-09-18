"use client";

/*
 * A press-and-hold confirmation for a
 * destructive action: a fill sweeps across the button for as long as it is
 * held and the action fires when it is full; releasing early drains it and
 * nothing happens. Holding Space or Enter works the same way. import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import { EASE_OUT } from "@showcase/components/ui/ai-motion";
import { Button } from "@showcase/components/ui/button";
import { cn } from "@showcase/lib/utils";

type ButtonProps = React.ComponentProps<typeof Button>;
type HoldVariant = NonNullable<ButtonProps["variant"]>;

export interface HoldActionButtonLabels {
  /** Shown while the button is held. */
  holding: React.ReactNode;
  /** Shown once the hold has confirmed, until release. */
  complete: React.ReactNode;
  /** Accessible description of the gesture, read with the button's name. */
  description: string;
  /** Announced to assistive technology when the action fires. */
  confirmed: string;
}

const DEFAULT_LABELS: HoldActionButtonLabels = {
  holding: "Keep holding",
  complete: "Done",
  description: "Press and hold to confirm. Release to cancel.",
  confirmed: "Confirmed",
};

const FILL_CLASS: Record<HoldVariant, string> = {
  destructive: "bg-destructive/20",
  default: "bg-primary-foreground/20",
  outline: "bg-foreground/10",
  secondary: "bg-foreground/10",
  ghost: "bg-foreground/10",
  link: "bg-foreground/10",
};

export interface HoldActionButtonProps extends Omit<
  ButtonProps,
  | "children"
  | "onClick"
  | "onPointerDown"
  | "onPointerUp"
  | "onPointerMove"
  | "onPointerCancel"
  | "onPointerLeave"
  | "onKeyDown"
  | "onKeyUp"
  | "onBlur"
  | "render"
  | "ripple"
> {
  children: React.ReactNode;
  /** Fires once, when the hold completes. */
  onConfirm?: () => void;
  /** How long the button must be held, in milliseconds. */
  holdDuration?: number;
  labels?: Partial<HoldActionButtonLabels>;
  fillClassName?: string;
}

function isHoldKey(key: string) {
  return key === " " || key === "Enter";
}

export function HoldActionButton({
  children,
  onConfirm,
  holdDuration = 1600,
  variant = "destructive",
  size = "lg",
  labels: labelsProp,
  disabled,
  className,
  fillClassName,
  ...props
}: HoldActionButtonProps) {
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const reduced = useReducedMotion() ?? false;
  const descriptionId = React.useId();
  const [holding, setHolding] = React.useState(false);
  const [completed, setCompleted] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onConfirmRef = React.useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  const clearTimer = React.useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  React.useEffect(() => clearTimer, [clearTimer]);

  // A disabled button abandons any hold in progress.
  React.useEffect(() => {
    if (!disabled) return;
    clearTimer();
    setHolding(false);
    setCompleted(false);
  }, [disabled, clearTimer]);

  const startHold = () => {
    if (disabled || timerRef.current !== null) return;
    setCompleted(false);
    setHolding(true);
    // The timer, not the fill animation, decides: the fill is feedback.
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setCompleted(true);
      onConfirmRef.current?.();
    }, holdDuration);
  };

  const cancelHold = () => {
    clearTimer();
    setHolding(false);
    setCompleted(false);
  };

  const active = holding || completed;
  const variantKey: HoldVariant = variant ?? "destructive";

  return (
    <>
      <Button
        {...props}
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        aria-describedby={descriptionId}
        data-holding={holding || undefined}
        data-complete={completed || undefined}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          startHold();
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Capture is a convenience; the hold works without it.
          }
        }}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onPointerMove={(event) => {
          // A captured pointer gets no leave events, so measure: sliding off
          // the button abandons the hold.
          if (!holding) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          ) {
            cancelHold();
          }
        }}
        onKeyDown={(event) => {
          if (!isHoldKey(event.key)) return;
          event.preventDefault();
          if (!event.repeat) startHold();
        }}
        onKeyUp={(event) => {
          if (!isHoldKey(event.key)) return;
          event.preventDefault();
          cancelHold();
        }}
        onBlur={cancelHold}
        onContextMenu={(event) => event.preventDefault()}
        className={cn(
          "relative isolate touch-none overflow-hidden select-none",
          className
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
          style={{ borderRadius: "inherit" }}
        >
          <motion.span
            initial={false}
            animate={
              reduced
                ? { opacity: active ? 1 : 0, scaleX: 1 }
                : { opacity: 1, scaleX: active ? 1 : 0 }
            }
            transition={
              active
                ? { duration: holdDuration / 1000, ease: "linear" }
                : { duration: reduced ? 0 : 0.24, ease: EASE_OUT }
            }
            className={cn(
              "absolute inset-0 origin-left",
              FILL_CLASS[variantKey],
              fillClassName
            )}
          />
        </span>

        <span className="grid place-items-center">
          <motion.span
            animate={{ opacity: active ? 0 : 1 }}
            transition={{ duration: reduced ? 0 : 0.12, ease: EASE_OUT }}
            className="col-start-1 row-start-1 inline-flex items-center gap-1.5"
          >
            {children}
          </motion.span>
          <motion.span
            aria-hidden
            animate={{ opacity: holding && !completed ? 1 : 0 }}
            transition={{ duration: reduced ? 0 : 0.12, ease: EASE_OUT }}
            className="col-start-1 row-start-1"
          >
            {labels.holding}
          </motion.span>
          <motion.span
            aria-hidden
            animate={{ opacity: completed ? 1 : 0 }}
            transition={{ duration: reduced ? 0 : 0.12, ease: EASE_OUT }}
            className="col-start-1 row-start-1"
          >
            {labels.complete}
          </motion.span>
        </span>
      </Button>
      {/* Outside the button, so neither joins its accessible name. */}
      <span id={descriptionId} className="sr-only">
        {labels.description}
      </span>
      <span aria-live="assertive" className="sr-only">
        {completed ? labels.confirmed : ""}
      </span>
    </>
  );
}
