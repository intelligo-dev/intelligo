"use client";

/*
 * Lists that arrive: a container that staggers
 * its rows in on mount, rows that rise in, fall out under AnimatePresence
 * and glide when reordered, and a block that reveals once as it scrolls into
 * view. import * as React from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from "motion/react";

import {
  EASE_OUT,
  listItem,
  listStagger,
  SPRING_LAYOUT,
} from "@/components/ui/ai-motion";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
 * AnimatedList: the container. Its children stagger in on mount; rows added
 * later rise in on their own. Render it as the element the markup needs —
 * a `tbody` for table rows keeps the table valid.
 * ------------------------------------------------------------------------- */

export type AnimatedListElement = "ul" | "ol" | "div" | "tbody";

export type AnimatedListProps<T extends AnimatedListElement = "ul"> = Omit<
  HTMLMotionProps<T>,
  "variants" | "initial" | "animate"
> & {
  /** The element to render; `tbody` for table rows. */
  as?: T;
  /** Seconds between one row and the next. */
  stagger?: number;
  /** Seconds before the first row starts. */
  delay?: number;
  /** Play the stagger on mount (default). False shows the rows at rest. */
  animateOnMount?: boolean;
};

const REDUCED_ITEM: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

function AnimatedList<T extends AnimatedListElement = "ul">({
  as,
  stagger,
  delay,
  animateOnMount = true,
  className,
  ...props
}: AnimatedListProps<T>) {
  const reduced = useReducedMotion() ?? false;
  const Component = motion[as ?? "ul"] as React.ElementType;

  const variants = React.useMemo<Variants>(() => {
    if (reduced) return { hidden: {}, shown: {} };
    if (stagger === undefined && delay === undefined) return listStagger;
    return {
      hidden: {},
      shown: {
        transition: {
          staggerChildren: stagger ?? 0.04,
          delayChildren: delay ?? 0.02,
        },
      },
    };
  }, [reduced, stagger, delay]);

  return (
    <Component
      data-slot="animated-list"
      variants={variants}
      initial={animateOnMount ? "hidden" : false}
      animate="shown"
      className={className}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------------------
 * AnimatedListItem: a row. It takes its entrance from the list's stagger,
 * leaves with its exit when wrapped in AnimatePresence, and glides to its
 * new place on a reorder. Use `tr` inside a `tbody` list. Keep
 * AnimatePresence in its default mode for table rows — `popLayout` lifts
 * the leaving row out of the table.
 * ------------------------------------------------------------------------- */

export type AnimatedListItemElement = "li" | "div" | "tr";

export type AnimatedListItemProps<T extends AnimatedListItemElement = "li"> =
  Omit<HTMLMotionProps<T>, "variants"> & {
    /** The element to render; `tr` for table rows. */
    as?: T;
  };

function AnimatedListItem<T extends AnimatedListItemElement = "li">({
  as,
  layout,
  transition,
  className,
  ...props
}: AnimatedListItemProps<T>) {
  const reduced = useReducedMotion() ?? false;
  const Component = motion[as ?? "li"] as React.ElementType;

  return (
    <Component
      data-slot="animated-list-item"
      variants={reduced ? REDUCED_ITEM : listItem}
      exit="exit"
      layout={reduced ? false : (layout ?? "position")}
      transition={
        transition ?? (reduced ? { duration: 0 } : { layout: SPRING_LAYOUT })
      }
      className={className}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------------------
 * ScrollReveal: a block that rises and clears the first time enough of it
 * scrolls into view.
 * ------------------------------------------------------------------------- */

export interface ScrollRevealProps
  extends Omit<HTMLMotionProps<"div">, "initial" | "animate"> {
  /** Distance in px the block rises from. */
  y?: number;
  /** Blur in px it clears from; kept at 10 or under. */
  blur?: number;
  /** Seconds the reveal takes. */
  duration?: number;
  /** Seconds before the reveal starts once in view. */
  delay?: number;
  /** Reveal only the first time (default), or every time it enters. */
  once?: boolean;
  /** How much of the block must be visible to reveal it. */
  amount?: "some" | "all" | number;
  /** The scroll container, for blocks inside a scroll area. Defaults to the viewport. */
  root?: React.RefObject<Element | null>;
}

function ScrollReveal({
  y = 16,
  blur = 8,
  duration = 0.6,
  delay = 0,
  once = true,
  amount = 0.3,
  root,
  transition,
  className,
  children,
  ...props
}: ScrollRevealProps) {
  const reduced = useReducedMotion() ?? false;
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { root, once, amount });
  const blurPx = Math.min(Math.max(blur, 0), 10);

  const hidden = reduced
    ? { opacity: 0 }
    : { opacity: 0, y, filter: `blur(${blurPx}px)` };
  const shown = reduced
    ? { opacity: 1 }
    : { opacity: 1, y: 0, filter: "blur(0px)" };

  return (
    <motion.div
      data-slot="scroll-reveal"
      {...props}
      ref={ref}
      initial={hidden}
      animate={inView ? shown : hidden}
      transition={
        transition ??
        (reduced ? { duration: 0 } : { duration, delay, ease: EASE_OUT })
      }
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}

export { AnimatedList, AnimatedListItem, ScrollReveal };
