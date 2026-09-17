"use client";

/*
 * Site effect. Words rise out of a blur one after another, once, on load.
 * After the MIT-licensed text reveal; a reader who
 * asked for less motion gets a plain fade.
 */

import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const SPRING = {
  type: "spring",
  stiffness: 140,
  damping: 26,
  mass: 1.2,
} as const;

export function TextReveal({
  text,
  className,
  delay = 0,
  stagger = 0.07,
  blur = 10,
}: {
  text: string;
  className?: string;
  /** Seconds before the first word. */
  delay?: number;
  /** Seconds between words. */
  stagger?: number;
  /** Starting blur, in px. */
  blur?: number;
}) {
  const reduce = useReducedMotion();
  const words = text.match(/\S+\s*/g) ?? [];
  return (
    <span className={className}>
      {words.map((word, i) => {
        const d = delay + i * stagger;
        return (
          <motion.span
            key={`${word}-${i}`}
            initial={
              reduce
                ? { opacity: 0 }
                : { opacity: 0, y: "40%", filter: `blur(${blur}px)` }
            }
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={
              reduce
                ? { duration: 0.25, delay: d * 0.3 }
                : {
                    y: { ...SPRING, delay: d },
                    opacity: { duration: 0.7, ease: EASE_OUT, delay: d },
                    filter: { duration: 0.9, ease: EASE_OUT, delay: d },
                  }
            }
            // whitespace-pre keeps each word's trailing space inside its inline-block
            className={cn("inline-block whitespace-pre will-change-transform")}
          >
            {word}
          </motion.span>
        );
      })}
    </span>
  );
}
