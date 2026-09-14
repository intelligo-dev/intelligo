"use client";

/*
 * The motion vocabulary the AI
 * parts share: easing curves, spring presets, a transform-only
 * disclosure and a text swap. import * as React from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from "motion/react";

import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
 * Easing and springs. Strong custom curves — the CSS defaults feel weak.
 * ------------------------------------------------------------------------- */

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;
/** CSS string form of EASE_OUT for inline style transitions. */
export const EASE_OUT_CSS = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Press feedback on buttons and other tappable surfaces. */
export const SPRING_PRESS = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 0.6,
} as const;
/** Content swaps — label and icon slots trading places inside a control. */
export const SPRING_SWAP = {
  type: "spring",
  stiffness: 460,
  damping: 30,
  mass: 0.55,
} as const;
/** Overlay panel entrances — popovers and sheets summoned by a pointer. */
export const SPRING_PANEL = {
  type: "spring",
  stiffness: 420,
  damping: 40,
  mass: 0.5,
} as const;
/** Shared-layout glides — pills, indicators and panels morphing between positions. */
export const SPRING_LAYOUT = {
  type: "spring",
  stiffness: 360,
  damping: 32,
  mass: 0.6,
} as const;
/** Cursor-follow physics for decorative tracking. */
export const SPRING_MOUSE = { stiffness: 200, damping: 15, mass: 0.3 } as const;
/** Dragged handles and fills — critically damped, never rebounds. */
export const SPRING_GLIDE = { stiffness: 700, damping: 50, mass: 0.5 } as const;

/* ----------------------------------------------------------------------------
 * Disclosure: a transform-only reveal for collapsible agent content.
 * ------------------------------------------------------------------------- */

export interface DisclosureProps
  extends Omit<HTMLMotionProps<"div">, "animate" | "initial"> {
  open: boolean;
  openHeight?: React.CSSProperties["height"];
}

function Disclosure({
  open,
  openHeight = "auto",
  className,
  style,
  transition,
  ...props
}: DisclosureProps) {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.div
      data-slot="disclosure"
      data-state={open ? "open" : "closed"}
      {...props}
      aria-hidden={!open}
      inert={!open}
      initial={false}
      animate={
        reduced
          ? { opacity: open ? 1 : 0 }
          : {
              opacity: open ? 1 : 0,
              clipPath: open ? "inset(0 0 0% 0)" : "inset(0 0 100% 0)",
              y: open ? 0 : -4,
            }
      }
      transition={
        transition ?? {
          duration: reduced ? 0 : open ? 0.22 : 0.14,
          ease: EASE_OUT,
        }
      }
      className={cn("overflow-hidden", className)}
      style={{
        ...style,
        height: open ? openHeight : 0,
        pointerEvents: open ? undefined : "none",
        transformOrigin: "top",
      }}
    />
  );
}

/* ----------------------------------------------------------------------------
 * SwapText: a value that rolls or blurs into its replacement — a counter,
 * a status word — without the layout jumping.
 * ------------------------------------------------------------------------- */

export type SwapAnimation = "blur" | "roll";

const ROLL_EXIT = { duration: 0.14, ease: EASE_OUT } as const;
const BLUR = { duration: 0.2, ease: "easeInOut" } as const;

const SWAP_VARIANTS: Record<SwapAnimation, Variants> = {
  blur: {
    initial: { opacity: 0, filter: "blur(8px)", scale: 0.96 },
    animate: { opacity: 1, filter: "blur(0px)", scale: 1, transition: BLUR },
    exit: { opacity: 0, filter: "blur(8px)", scale: 0.96, transition: BLUR },
  },
  roll: {
    initial: { opacity: 0, y: "0.55em", filter: "blur(3px)" },
    animate: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: SPRING_SWAP,
    },
    exit: {
      opacity: 0,
      y: "-0.55em",
      filter: "blur(3px)",
      transition: ROLL_EXIT,
    },
  },
};

export interface SwapTextProps {
  /** The identity of the current content; a change animates the swap. */
  value: string;
  children: React.ReactNode;
  animation?: SwapAnimation;
  className?: string;
}

function SwapText({
  value,
  children,
  animation = "roll",
  className,
}: SwapTextProps) {
  const reduced = useReducedMotion() ?? false;

  return (
    <span
      data-slot="swap-text"
      className={cn(
        "relative inline-block max-w-full align-bottom whitespace-nowrap",
        className
      )}
      style={{ clipPath: "inset(0 -999px)" }}
    >
      {/* The invisible copy holds the width so the swap never reflows. */}
      <span aria-hidden className="invisible inline-block whitespace-nowrap">
        {children}
      </span>
      <AnimatePresence initial={false}>
        <motion.span
          key={`${animation}-${value}`}
          variants={SWAP_VARIANTS[animation]}
          initial={reduced ? false : "initial"}
          animate={
            reduced
              ? { opacity: 1, filter: "blur(0px)", scale: 1, y: 0 }
              : "animate"
          }
          exit={reduced ? undefined : "exit"}
          className="absolute top-0 left-0 inline-block max-w-full truncate"
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export { Disclosure, SwapText };
