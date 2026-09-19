import { useEffect, useRef, useState } from "react";
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
 *
 * The pin is a desktop mechanic. On a phone a card is one column and
 * taller than the box it is pinned in, so the next card would paint over
 * its evidence; below `md` the three are an ordinary stack.
 */
function Card({
  index,
  total,
  container,
  reduce,
  pinned,
  card,
}: {
  index: number;
  total: number;
  container: React.RefObject<HTMLDivElement | null>;
  reduce: boolean;
  pinned: boolean;
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
      className="mb-4 flex items-start justify-center last:mb-0 md:sticky md:top-20 md:mb-0 md:h-[44vh] md:min-h-[320px]"
      style={pinned ? { zIndex: index + 1 } : undefined}
    >
      <motion.article
        style={pinned ? { scale, top: `${index * 24}px` } : undefined}
        className="relative grid w-full origin-top gap-6 rounded-xl border border-border bg-card p-6 md:min-h-[300px] md:grid-cols-[1.1fr_1fr] md:p-8"
      >
        <div>
          <span className="tag">[ {card.tag} ]</span>
          <h3 className="mt-3 text-[1.35rem] font-semibold leading-tight text-foreground md:text-[1.6rem]">
            {card.title}
          </h3>
          <p className="mt-3 max-w-[46ch] text-[0.98rem] text-foreground/70">
            {card.body}
          </p>
        </div>
        <div className="mono self-end overflow-x-auto rounded-lg border border-border bg-background p-3.5 text-[0.76rem] leading-relaxed">
          {card.evidence.map((l, i) => (
            <div
              key={i}
              className={
                l.startsWith("$")
                  ? "text-foreground"
                  : l.startsWith("✓")
                    ? "text-success"
                    : "text-foreground/70"
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
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const read = () => setPinned(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
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
          pinned={pinned}
        />
      ))}
    </div>
  );
}
