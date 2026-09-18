/*
 * Site effect. Words rise out of a blur one after another, once, on load.
 * After the MIT-licensed text reveal.
 *
 * The motion is a CSS animation (`.word-rise` in global.css), not a
 * script: the words are in the HTML at full opacity, so the headline is
 * there before anything hydrates and with no JavaScript at all. A reader
 * who asked for less motion gets the words as they are.
 */

import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

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
  const words = text.match(/\S+\s*/g) ?? [];
  return (
    <span className={className}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          style={
            {
              "--word-delay": `${(delay + i * stagger).toFixed(2)}s`,
              "--word-blur": `${blur}px`,
            } as CSSProperties
          }
          // whitespace-pre keeps each word's trailing space inside its inline-block
          className={cn("word-rise inline-block whitespace-pre")}
        >
          {word}
        </span>
      ))}
    </span>
  );
}
