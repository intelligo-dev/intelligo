import { useEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";
import { OTHER_HALF, YOUR_HALF } from "@/lib/ledger";

/**
 * Two halves. The left column is sticky; the right column is a ledger
 * whose lines appear one by one as you scroll, then all flip to
 * "shipped" — the moment the problem becomes the opportunity.
 *
 * The scroll effect is an enhancement over a finished list: the HTML the
 * server sends is the end state — every line legible, all of them
 * shipped, the count at its total — and the lines only dim once a script
 * is there to bring them back. A reader who asked for less motion keeps
 * the finished list.
 */

function LedgerLine({
  index,
  total,
  progress,
  text,
  pkg,
  animated,
}: {
  index: number;
  total: number;
  progress: MotionValue<number>;
  text: string;
  pkg: string;
  animated: boolean;
}) {
  // each line reveals in its own slice of the first 75% of the scroll; the last 25% flips all to shipped
  const start = (index / total) * 0.72;
  const end = start + 0.06;
  // dim, not gone: a line waiting its turn is still a line you can read
  const opacity = useTransform(progress, [start, end], [0.35, 1]);
  const x = useTransform(progress, [start, end], [10, 0]);
  const shipped = useTransform(progress, [0.8, 0.9], [0, 1]);
  const checkOpacity = useTransform(shipped, [0, 1], [0, 1]);
  const color = useTransform(
    shipped,
    [0, 1],
    [
      "color-mix(in oklab, var(--foreground) 70%, transparent)",
      "var(--foreground)",
    ]
  );

  return (
    <motion.li
      style={animated ? { opacity, x } : undefined}
      className="flex items-baseline gap-3 border-b border-border py-2 text-[0.92rem]"
    >
      <span className="mono w-5 shrink-0 text-[0.7rem] tabular-nums text-muted-foreground">
        {String(index + 1).padStart(2, "0")}
      </span>
      <motion.span
        style={animated ? { color } : undefined}
        className="flex-1 text-foreground"
      >
        {text}
      </motion.span>
      <span className="mono hidden text-[0.68rem] text-muted-foreground sm:inline">
        {pkg}
      </span>
      <motion.span
        style={animated ? { opacity: checkOpacity } : undefined}
        className="mono text-[0.7rem] text-success"
      >
        ✓ shipped
      </motion.span>
    </motion.li>
  );
}

export function ScrollLedger() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const animated = mounted && !reduce;
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 70%", "end 60%"],
  });
  const counted = useTransform(
    scrollYProgress,
    [0, 0.72],
    [0, OTHER_HALF.length]
  );
  const counterText = useTransform(counted, (v) => Math.round(v).toString());
  const finalOpacity = useTransform(scrollYProgress, [0.82, 0.92], [0, 1]);
  const finalY = useTransform(scrollYProgress, [0.82, 0.92], [8, 0]);

  return (
    <div ref={ref} className="grid gap-10 lg:grid-cols-[1fr_1.35fr] lg:gap-16">
      {/* your half — sticky */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="tag">your half — the 30%</div>
        <ul className="mt-4 border-t border-foreground/15">
          {YOUR_HALF.map((y) => (
            <li key={y.title} className="border-b border-border py-4">
              <div className="text-[1.35rem] font-semibold leading-tight text-foreground">
                {y.title}
              </div>
              <div className="mt-0.5 text-[0.9rem] text-foreground/70">
                {y.note}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-6 border border-foreground/15 bg-card p-4">
          <div className="mono flex items-baseline gap-2 text-[0.72rem] text-muted-foreground">
            <span>the other half, counted</span>
            <motion.span className="ml-auto text-[1.6rem] leading-none tabular-nums text-foreground">
              {animated ? counterText : OTHER_HALF.length}
            </motion.span>
          </div>
          <motion.p
            style={animated ? { opacity: finalOpacity, y: finalY } : undefined}
            className="mt-3 text-[0.95rem] text-foreground"
          >
            {OTHER_HALF.length} things, none of them yours.{" "}
            <strong className="text-success">All shipped.</strong>
          </motion.p>
        </div>
      </div>

      {/* the other half — the ledger */}
      <div>
        <div className="tag">the other half — rebuilt in every AI SaaS</div>
        <ol className={cn("mt-4 border-t border-foreground/15")}>
          {OTHER_HALF.map((o, i) => (
            <LedgerLine
              key={o.text}
              index={i}
              total={OTHER_HALF.length}
              progress={scrollYProgress}
              text={o.text}
              pkg={o.pkg}
              animated={animated}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}
