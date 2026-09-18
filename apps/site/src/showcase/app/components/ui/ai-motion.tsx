"use client";

/*
 * Intelligo design system. The motion vocabulary every tier shares:
 * easing curves, spring presets, a transform-only disclosure, a text
 * swap, the popup and backdrop presets the primitives open with, the
 * button's press, and list staggers. import * as React from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from "motion/react";

import { cn } from "@showcase/lib/utils";

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
/** Popups rising out of their trigger — menus, popovers, dialogs, tooltips. */
export const SPRING_POPUP = {
  type: "spring",
  stiffness: 520,
  damping: 38,
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

/* ----------------------------------------------------------------------------
 * Popups. A Base UI popup animates with motion only when its root is
 * controlled, so AnimatePresence can see the open state and hold the
 * portal mounted through the exit. `useOpenState` makes any root
 * controlled without changing its API: a passed `open` still wins,
 * `defaultOpen` still seeds it, and a cancelled change is respected.
 * ------------------------------------------------------------------------- */

type OpenChangeHandler<Details> =
  | ((open: boolean, details: Details) => void)
  | undefined;

export function useOpenState<Details>(
  open: boolean | undefined,
  defaultOpen: boolean | undefined,
  onOpenChange: OpenChangeHandler<Details>
) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen ?? false);
  const controlled = open !== undefined;

  const setOpen = React.useCallback(
    (next: boolean, details: Details) => {
      onOpenChange?.(next, details);
      if ((details as { isCanceled?: boolean } | undefined)?.isCanceled) return;
      if (!controlled) setUncontrolled(next);
    },
    [controlled, onOpenChange]
  );

  return [controlled ? open : uncontrolled, setOpen] as const;
}

/**
 * The enter and exit of a popup that grows out of its trigger: scale from
 * the trigger's side (the popup's `origin-(--transform-origin)`), a blur
 * that clears, a quick fade out. Opacity always animates — Base UI reads
 * it through `getAnimations()` to know when the exit is done.
 */
export function popupMotion(reduced: boolean, from = 0.92) {
  if (reduced) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0 } },
      exit: { opacity: 0, transition: { duration: 0 } },
    } as const;
  }
  return {
    initial: { opacity: 0, scale: from, filter: "blur(4px)" },
    animate: {
      opacity: 1,
      scale: 1,
      filter: "blur(0px)",
      transition: {
        ...SPRING_POPUP,
        opacity: { duration: 0.16, ease: EASE_OUT },
        filter: { duration: 0.2, ease: EASE_OUT },
      },
    },
    exit: {
      opacity: 0,
      scale: (from + 1) / 2,
      filter: "blur(2px)",
      transition: { duration: 0.12, ease: EASE_IN_OUT },
    },
  } as const;
}

/** A backdrop that fades under a dialog or sheet. */
export function backdropMotion(reduced: boolean) {
  const duration = reduced ? 0 : 0.2;
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration, ease: EASE_OUT } },
    exit: { opacity: 0, transition: { duration: duration * 0.7 } },
  } as const;
}

/* ----------------------------------------------------------------------------
 * Press: the button's element — a spring down on press, a spring back on
 * release, and an optional ripple from the press point. The button item
 * renders it through Base UI's `render`, so the button module itself stays
 * importable from a server component.
 * ------------------------------------------------------------------------- */

type Ripple = { id: number; x: number; y: number; size: number };

export interface PressProps extends HTMLMotionProps<"button"> {
  /** How far the surface sinks on press; 1 turns the press off. */
  pressScale?: number;
  /** Spread a ripple from the press point. */
  ripple?: boolean;
}

function Press({
  pressScale = 0.97,
  ripple = false,
  className,
  children,
  onPointerDown,
  ...props
}: PressProps) {
  const reduced = useReducedMotion() ?? false;
  const [ripples, setRipples] = React.useState<Ripple[]>([]);
  const nextId = React.useRef(0);
  const opensPopup =
    props["aria-haspopup"] !== undefined && props["aria-haspopup"] !== false;
  const sinks = !reduced && !opensPopup && pressScale !== 1;

  return (
    <motion.button
      {...props}
      className={cn(ripple && "relative overflow-hidden", className)}
      whileTap={sinks ? { scale: pressScale } : undefined}
      transition={SPRING_PRESS}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (!ripple || reduced) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2;
        const id = nextId.current++;
        setRipples((current) => [
          ...current,
          {
            id,
            x: event.clientX - rect.left - size / 2,
            y: event.clientY - rect.top - size / 2,
            size,
          },
        ]);
      }}
    >
      {children as React.ReactNode}
      {ripple && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <AnimatePresence>
            {ripples.map((r) => (
              <motion.span
                key={r.id}
                className="absolute rounded-full bg-current"
                style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
                initial={{ scale: 0, opacity: 0.18 }}
                animate={{ scale: 1, opacity: 0 }}
                transition={{ duration: 0.6, ease: EASE_OUT }}
                onAnimationComplete={() =>
                  setRipples((current) => current.filter((c) => c.id !== r.id))
                }
              />
            ))}
          </AnimatePresence>
        </span>
      )}
    </motion.button>
  );
}

/* ----------------------------------------------------------------------------
 * Lists. A container staggers its children in; each child rises and
 * clears. Pair `listStagger` on the parent with `listItem` on the rows.
 * ------------------------------------------------------------------------- */

export const listStagger: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 6, filter: "blur(2px)" },
  shown: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.32, ease: EASE_OUT },
  },
  exit: { opacity: 0, y: -4, transition: { duration: 0.14, ease: EASE_IN_OUT } },
};

export { Disclosure, Press, SwapText };
