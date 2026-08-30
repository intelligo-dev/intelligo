"use client";

import { cn } from "@/lib/utils";
import {
  motion,
  useReducedMotion,
  type Transition,
  type Variants,
} from "motion/react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type HTMLAttributes,
} from "react";

type SplitMode = "words" | "characters" | "lines";
type RevealDirection = "up" | "down" | "left" | "right";
type StaggerOrigin = "start" | "end" | "center" | "edges" | "random" | number;

export interface KineticTextRevealRef {
  /** Starts or replays the reveal animation. */
  play: () => void;
  /** Moves the text back to its hidden state. */
  reset: () => void;
}

interface KineticTextRevealProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "children"
> {
  /** Text content to reveal. */
  text: string;
  /** Additional CSS classes for the outer element. */
  className?: string;
  /** CSS classes applied to each animated text segment. */
  segmentClassName?: string;
  /** CSS classes applied to each clipping wrapper. */
  maskClassName?: string;
  /** How the text is segmented before animation. */
  splitBy?: SplitMode;
  /** Direction each segment travels from. */
  direction?: RevealDirection;
  /** Distance each segment travels in pixels. */
  distance?: number;
  /** Delay between animated segments in seconds. */
  stagger?: number;
  /** Where the stagger wave begins. */
  staggerFrom?: StaggerOrigin;
  /** Animation transition for each segment. */
  transition?: Transition;
  /** Adds blur while segments are hidden. */
  blur?: boolean;
  /** Starts automatically after mount. */
  autoPlay?: boolean;
  /** Optional delay before the automatic reveal begins, in seconds. */
  delay?: number;
  /** Called when the reveal begins. */
  onRevealStart?: () => void;
  /** Called after the last segment completes. */
  onRevealComplete?: () => void;
}

interface Segment {
  value: string;
  animated: boolean;
  index: number;
}

function splitIntoGraphemes(value: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    return Array.from(segmenter.segment(value), ({ segment }) => segment);
  }

  return Array.from(value);
}

function getSegments(text: string, splitBy: SplitMode): Segment[] {
  let animatedIndex = 0;

  if (splitBy === "lines") {
    return text.split("\n").map((line) => {
      const animated = line.length > 0;
      return {
        value: line,
        animated,
        index: animated ? animatedIndex++ : -1,
      };
    });
  }

  if (splitBy === "characters") {
    return splitIntoGraphemes(text).map((character) => {
      const animated = !/\s/.test(character);
      return {
        value: character,
        animated,
        index: animated ? animatedIndex++ : -1,
      };
    });
  }

  return text.split(/(\s+)/).map((part) => {
    const animated = !/^\s+$/.test(part) && part.length > 0;
    return {
      value: part,
      animated,
      index: animated ? animatedIndex++ : -1,
    };
  });
}

function getDelay(
  index: number,
  total: number,
  stagger: number,
  staggerFrom: StaggerOrigin,
) {
  if (typeof staggerFrom === "number") {
    return Math.abs(staggerFrom - index) * stagger;
  }

  if (staggerFrom === "end") {
    return (total - 1 - index) * stagger;
  }

  if (staggerFrom === "center") {
    return Math.abs((total - 1) / 2 - index) * stagger;
  }

  if (staggerFrom === "edges") {
    return Math.min(index, total - 1 - index) * stagger;
  }

  if (staggerFrom === "random") {
    const seeded = Math.abs(Math.sin(index * 12.9898) * 43758.5453) % 1;
    return Math.floor(seeded * total) * stagger;
  }

  return index * stagger;
}

function getOffset(direction: RevealDirection, distance: number) {
  if (direction === "down") return { x: 0, y: -distance };
  if (direction === "left") return { x: distance, y: 0 };
  if (direction === "right") return { x: -distance, y: 0 };
  return { x: 0, y: distance };
}

export const KineticTextReveal = forwardRef<
  KineticTextRevealRef,
  KineticTextRevealProps
>(
  (
    {
      text,
      className,
      segmentClassName,
      maskClassName,
      splitBy = "words",
      direction = "up",
      distance = 20,
      stagger = 0.075,
      staggerFrom = "start",
      transition = { duration: 0.72, ease: [0.22, 1, 0.36, 1] },
      blur = true,
      autoPlay = true,
      delay = 0,
      onRevealStart,
      onRevealComplete,
      ...props
    },
    ref,
  ) => {
    const shouldReduceMotion = useReducedMotion();
    const [run, setRun] = useState(0);
    const [visible, setVisible] = useState(false);

    const segments = useMemo(() => getSegments(text, splitBy), [text, splitBy]);
    const animatedTotal = segments.filter((segment) => segment.animated).length;

    useImperativeHandle(ref, () => ({
      play: () => {
        setVisible(false);
        requestAnimationFrame(() => {
          setRun((current) => current + 1);
          setVisible(true);
          onRevealStart?.();
        });
      },
      reset: () => setVisible(false),
    }));

    useEffect(() => {
      if (!autoPlay) return;

      const timeout = window.setTimeout(() => {
        setRun((current) => current + 1);
        setVisible(true);
        onRevealStart?.();
      }, delay * 1000);

      return () => window.clearTimeout(timeout);
    }, [autoPlay, delay, text, onRevealStart]);

    const offset = getOffset(direction, distance);

    const variants: Variants = {
      hidden: shouldReduceMotion
        ? { opacity: 0 }
        : {
            opacity: 0,
            x: offset.x,
            y: offset.y,
            filter: blur ? "blur(6px)" : "blur(0px)",
          },
      visible: (index: number) => ({
        opacity: 1,
        x: 0,
        y: 0,
        filter: "blur(0px)",
        transition: shouldReduceMotion
          ? { duration: 0.01 }
          : {
              ...transition,
              delay: getDelay(index, animatedTotal, stagger, staggerFrom),
            },
      }),
    };

    return (
      <span
        className={cn(
          "inline-flex flex-wrap whitespace-pre-wrap align-baseline",
          splitBy === "lines" && "flex-col items-start",
          className,
        )}
        aria-label={text}
        {...props}
      >
        <span className="sr-only">{text}</span>
        {segments.map((segment, index) => {
          if (!segment.animated) {
            return (
              <span key={`${run}-${index}`} aria-hidden="true">
                {segment.value}
              </span>
            );
          }

          return (
            <span
              key={`${run}-${index}`}
              className={cn(
                "inline-block overflow-hidden align-baseline pb-1",
                maskClassName,
              )}
              aria-hidden="true"
            >
              <motion.span
                custom={segment.index}
                variants={variants}
                initial="hidden"
                animate={visible ? "visible" : "hidden"}
                className={cn(
                  "inline-block will-change-transform",
                  segmentClassName,
                )}
                onAnimationComplete={
                  segment.index === animatedTotal - 1
                    ? onRevealComplete
                    : undefined
                }
              >
                {segment.value}
              </motion.span>
            </span>
          );
        })}
      </span>
    );
  },
);

KineticTextReveal.displayName = "KineticTextReveal";
