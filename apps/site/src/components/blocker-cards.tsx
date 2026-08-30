import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { BLOCKERS } from "@/lib/blockers";

/**
 * Forked from @componentry/sticky-scroll-cards: same pin-and-scale
 * mechanic, but text cards with a terminal evidence panel instead of
 * images, and no Lenis (native scrolling is fine for three cards).
 */
function Card({
  index,
  total,
  container,
  reduce,
  card,
}: {
  index: number;
  total: number;
  container: React.RefObject<HTMLDivElement | null>;
  reduce: boolean;
  card: (typeof BLOCKERS)[number];
}) {
  const { scrollYProgress } = useScroll({
    target: container,
    offset: ["start start", "end end"],
  });
  const start = index / (total + 1);
  const restingScale = 1 - (total - index - 1) * 0.05;
  const scale = useTransform(
    scrollYProgress,
    [start, 1],
    reduce ? [1, 1] : [1, restingScale]
  );

  return (
    // later cards must paint over earlier ones: explicit z-index, opaque surfaces
    <section
      className="sticky top-20 flex h-[62vh] min-h-[420px] items-start justify-center"
      style={{ zIndex: index + 1 }}
    >
      <motion.article
        style={{ scale, top: `${index * 24}px` }}
        className="relative grid min-h-[300px] w-full origin-top gap-6 border border-line-strong bg-paper-raised p-6 md:grid-cols-[1.1fr_1fr] md:p-8"
      >
        <div>
          <span className="tag">[ {card.tag} ]</span>
          <h3 className="mt-3 text-[1.35rem] font-semibold leading-tight text-ink md:text-[1.6rem]">
            {card.title}
          </h3>
          <p className="mt-3 max-w-[46ch] text-[0.98rem] text-ink-dim">
            {card.body}
          </p>
        </div>
        <div className="mono self-end border border-line bg-paper-sunken p-3.5 text-[0.76rem] leading-relaxed">
          {card.evidence.map((l, i) => (
            <div
              key={i}
              className={
                l.startsWith("$")
                  ? "text-ink"
                  : l.startsWith("✓")
                    ? "text-settle"
                    : "text-ink-dim"
              }
            >
              {l}
            </div>
          ))}
        </div>
      </motion.article>
    </section>
  );
}

export function BlockerCards() {
  const container = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  return (
    <div ref={container} className="relative">
      {BLOCKERS.map((b, i) => (
        <Card
          key={b.tag}
          card={b}
          index={i}
          total={BLOCKERS.length}
          container={container}
          reduce={reduce}
        />
      ))}
    </div>
  );
}
