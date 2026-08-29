import NumberFlow from "@number-flow/react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ProofSeries } from "@/lib/proof";

/**
 * A minimal, dependency-light sparkline — an SVG path scaled to the
 * series. Deliberately not the bklit-ui stat-card's visx-based chart:
 * that block pulls in `@central-icons-react/all`, which requires a paid
 * license key just to install, so it doesn't belong in an Apache-2.0
 * project. The layout and feel are still bklit-derived.
 */
function Sparkline({ series }: { series: number[] }) {
  const gradId = useId();
  const w = 120;
  const h = 34;
  const pad = 2;
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const range = max - min || 1;
  const step = (w - pad * 2) / Math.max(series.length - 1, 1);

  const points = series.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const [firstX] = points[0]!;
  const [lastX, lastY] = points[points.length - 1]!;
  const area = `${line} L${lastX.toFixed(2)},${h} L${firstX.toFixed(2)},${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--foreground)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} stroke="none" />
      <path d={line} fill="none" stroke="var(--foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.2" fill="var(--foreground)" />
    </svg>
  );
}

export function StatProofCard({ stat, className }: { stat: ProofSeries; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) {
        setShown(stat.value);
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [stat.value]);

  return (
    <div ref={ref} className={cn("relative flex flex-col gap-3 bg-paper-raised p-5", className)}>
      <div>
        <div className="mono text-[2.3rem] font-semibold leading-none tabular-nums text-ink">
          <NumberFlow value={shown} />
        </div>
        <div className="mono mt-1.5 text-[0.66rem] uppercase tracking-[0.08em] text-ink-faint">{stat.label}</div>
      </div>
      <Sparkline series={stat.series} />
    </div>
  );
}
