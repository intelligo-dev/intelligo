"use client";

/*
 * The line that says what the
 * agent is doing while it reasons: phrases cycle with a cascade, a swap
 * or a scramble, each shimmering, behind a terminal-style ASCII loader.
 * import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { EASE_OUT, SPRING_SWAP } from "@/components/ui/ai-motion";
import { shimmerStyle } from "@/components/ui/ai-shimmer-text";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
 * AsciiLoader: the frame set a CLI agent cycles through.
 * ------------------------------------------------------------------------- */

const ASCII_LINE = ["|", "/", "-", "\\"];

export interface AsciiLoaderProps
  extends Omit<React.ComponentProps<"span">, "children"> {
  /** Glyphs shown in turn. */
  frames?: string[];
  /** Font size in px. */
  size?: number;
  /** Seconds per full cycle. */
  speed?: number;
}

function AsciiLoader({
  frames = ASCII_LINE,
  size = 14,
  speed = 0.8,
  className,
  style,
  ...props
}: AsciiLoaderProps) {
  const reduced = useReducedMotion() ?? false;
  const [frame, setFrame] = React.useState(0);
  const count = frames.length;

  React.useEffect(() => {
    // Reduced motion slows the cycle rather than stopping it — it's a glyph
    // swap, not on-screen movement.
    const step = ((reduced ? speed * 2.5 : speed) / Math.max(1, count)) * 1000;
    const id = window.setInterval(
      () => setFrame((current) => (current + 1) % Math.max(1, count)),
      step
    );
    return () => window.clearInterval(id);
  }, [count, speed, reduced]);

  return (
    <span
      data-slot="ascii-loader"
      className={cn("font-mono leading-none tabular-nums", className)}
      style={{ fontSize: size, lineHeight: 1, ...style }}
      {...props}
    >
      {frames[frame % Math.max(1, count)]}
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * TextScramble: characters resolve into `text` left to right.
 * ------------------------------------------------------------------------- */

const DEFAULT_GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&@$?/";

export interface TextScrambleProps {
  /** Final text revealed by the scramble animation. */
  text: string;
  /** Maximum animation duration in milliseconds. */
  duration?: number;
  /** Characters sampled while unresolved positions are scrambling. */
  glyphs?: string;
  className?: string;
  style?: React.CSSProperties;
}

function TextScramble({
  text,
  duration,
  glyphs = DEFAULT_GLYPHS,
  className,
  style,
}: TextScrambleProps) {
  const reduced = useReducedMotion() ?? false;
  const [display, setDisplay] = React.useState(text);
  const mounted = React.useRef(false);
  const still = reduced || !glyphs;

  React.useEffect(() => {
    // The first text lands as it is; only a change scrambles.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (still) return;

    const characters = text.split("");
    const startedAt = performance.now();
    const animationDuration =
      duration ?? Math.min(760, Math.max(420, characters.length * 32));
    let frame = 0;
    let lastUpdate = 0;

    const animate = (now: number) => {
      if (now - lastUpdate >= 40) {
        lastUpdate = now;
        const progress = Math.min((now - startedAt) / animationDuration, 1);
        const settled = Math.floor(progress * characters.length);
        setDisplay(
          characters
            .map((character, index) => {
              if (index < settled || character === " ") return character;
              return glyphs[Math.floor(Math.random() * glyphs.length)];
            })
            .join("")
        );
      }

      if (now - startedAt < animationDuration) {
        frame = requestAnimationFrame(animate);
      } else {
        setDisplay(text);
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [duration, glyphs, still, text]);

  return (
    <span
      data-slot="text-scramble"
      className={cn("inline-block whitespace-pre", className)}
      style={style}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{still ? text : display}</span>
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * ReasoningText.
 * ------------------------------------------------------------------------- */

const DEFAULT_PHRASES = [
  "Thinking",
  "Reading the context",
  "Connecting the details",
  "Forming a response",
];

const CASCADE_STAGGER = 0.025;

export type ReasoningTextVariant = "cascade" | "swap" | "scramble";

export interface ReasoningTextProps {
  /** Phrases cycled through while the agent works. */
  phrases?: string[];
  /** Appended to every phrase; "…" by default. */
  suffix?: string;
  /** Animation used when the active phrase changes. */
  variant?: ReasoningTextVariant;
  /** Milliseconds each phrase remains visible. */
  interval?: number;
  /** Seconds taken for one shimmer pass. */
  shimmerDuration?: number;
  /** Optional leading visual. Defaults to a terminal-style ASCII loader. */
  indicator?: React.ReactNode;
  className?: string;
}

type PhraseProps = {
  phrase: string;
  suffix: string;
  reduced: boolean;
  shimmerDuration: number;
};

function CascadePhrase({ phrase, suffix, reduced, shimmerDuration }: PhraseProps) {
  const text = `${phrase}${suffix}`;

  if (reduced) {
    return (
      <span
        className="shimmer col-start-1 row-start-1 inline-block justify-self-start whitespace-pre"
        style={shimmerStyle(shimmerDuration)}
      >
        {text}
      </span>
    );
  }

  return (
    <AnimatePresence initial={false}>
      <motion.span
        key={phrase}
        className="col-start-1 row-start-1 inline-block justify-self-start whitespace-pre"
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {text.split("").map((character, characterIndex) => (
          <motion.span
            // Position is the stable cascade slot identity.
            key={characterIndex}
            custom={characterIndex * CASCADE_STAGGER}
            variants={{
              initial: { opacity: 0, y: "100%" },
              animate: (delay: number) => ({
                opacity: 1,
                y: "0%",
                transition: { ...SPRING_SWAP, delay },
              }),
              exit: (delay: number) => ({
                opacity: 0,
                y: "-100%",
                transition: {
                  duration: 0.14,
                  ease: EASE_OUT,
                  delay: delay * 0.45,
                },
              }),
            }}
            className="shimmer inline-block whitespace-pre will-change-[opacity,transform]"
            style={shimmerStyle(shimmerDuration)}
          >
            {character}
          </motion.span>
        ))}
      </motion.span>
    </AnimatePresence>
  );
}

function SwapPhrase({ phrase, suffix, reduced, shimmerDuration }: PhraseProps) {
  return (
    <AnimatePresence initial={false}>
      <motion.span
        key={phrase}
        className="shimmer col-start-1 row-start-1 inline-block justify-self-start whitespace-nowrap will-change-[opacity,transform]"
        style={shimmerStyle(shimmerDuration)}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 3 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: -3 }}
        transition={{
          duration: reduced ? 0.12 : 0.2,
          ease: EASE_OUT,
        }}
      >
        {phrase}
        {suffix}
      </motion.span>
    </AnimatePresence>
  );
}

function ScramblePhrase({ phrase, suffix, shimmerDuration }: PhraseProps) {
  return (
    <TextScramble
      text={`${phrase}${suffix}`}
      className="shimmer col-start-1 row-start-1 justify-self-start tabular-nums"
      style={shimmerStyle(shimmerDuration)}
    />
  );
}

function ReasoningText({
  phrases = DEFAULT_PHRASES,
  suffix = "…",
  variant = "cascade",
  interval = 1800,
  shimmerDuration = 2.2,
  indicator,
  className,
}: ReasoningTextProps) {
  const reduced = useReducedMotion() ?? false;
  const [index, setIndex] = React.useState(0);
  const statusId = React.useId();
  const safePhrases = phrases.length > 0 ? phrases : DEFAULT_PHRASES;
  const phrase = safePhrases[index % safePhrases.length] ?? "";
  const longestPhrase = safePhrases.reduce((longest, current) =>
    current.length > longest.length ? current : longest
  );
  const phraseProps = { phrase, suffix, reduced, shimmerDuration };

  React.useEffect(() => {
    if (safePhrases.length < 2) return;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % safePhrases.length);
    }, Math.max(600, interval));

    return () => window.clearInterval(timer);
  }, [interval, safePhrases.length]);

  return (
    <span
      data-slot="reasoning-text"
      data-variant={variant}
      role="status"
      aria-live="polite"
      aria-labelledby={statusId}
      className={cn(
        "inline-flex items-center gap-2 text-sm font-medium text-muted-foreground",
        className
      )}
    >
      <span
        data-slot="reasoning-text-indicator"
        aria-hidden="true"
        className="inline-flex size-3 shrink-0 items-center justify-center"
      >
        {indicator ?? <AsciiLoader />}
      </span>

      <span aria-hidden="true" className="grid overflow-hidden text-left">
        {/* The invisible copy holds the width so a phrase change never reflows. */}
        <span className="invisible col-start-1 row-start-1 whitespace-nowrap">
          {longestPhrase}
          {suffix}
        </span>
        {variant === "cascade" ? (
          <CascadePhrase {...phraseProps} />
        ) : variant === "scramble" ? (
          <ScramblePhrase {...phraseProps} />
        ) : (
          <SwapPhrase {...phraseProps} />
        )}
      </span>

      <span id={statusId} className="sr-only">
        {phrase}
      </span>
    </span>
  );
}

export { AsciiLoader, ReasoningText, TextScramble };
