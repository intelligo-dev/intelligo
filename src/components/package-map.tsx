import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CircuitBoard, type CircuitConnection, type CircuitNodeType } from "@/components/ui/circuit-board";
import { EDGES, PACKAGES } from "@/lib/packages";

/**
 * The package map on @componentry/circuit-board. Node positions are
 * laid out in three rows (your app / intelligo / postgres); edges are
 * the real import graph. Hover dims everything not connected to the
 * node; click opens its detail.
 */
const W = 760;
const H = 400;

const POS: Record<string, { x: number; y: number }> = {
  pages: { x: 150, y: 50 },
  actions: { x: 380, y: 50 },
  agent: { x: 610, y: 50 },
  auth: { x: 90, y: 190 },
  billing: { x: 210, y: 190 },
  "billing-core": { x: 210, y: 290 },
  core: { x: 330, y: 190 },
  audit: { x: 450, y: 190 },
  jobs: { x: 560, y: 190 },
  executions: { x: 670, y: 190 },
  admin: { x: 450, y: 290 },
  cli: { x: 560, y: 290 },
  mastra: { x: 670, y: 290 },
  db: { x: 330, y: 365 },
};

function useThemeVariant(): "light" | "dark" {
  const [v, setV] = useState<"light" | "dark">("light");
  useEffect(() => {
    const read = () => setV(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return v;
}

export function PackageMap() {
  const [selected, setSelected] = useState("executions");
  const [hover, setHover] = useState<string | null>(null);
  const variant = useThemeVariant();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, (e?.contentRect.width ?? W) / W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const focus = hover ?? selected;
  const related = useMemo(() => {
    const s = new Set<string>([focus]);
    for (const e of EDGES) {
      if (e.from === focus) s.add(e.to);
      if (e.to === focus) s.add(e.from);
    }
    return s;
  }, [focus]);

  const nodes: CircuitNodeType[] = PACKAGES.map((p) => ({
    id: p.id,
    x: POS[p.id]!.x,
    y: POS[p.id]!.y,
    // labels are the clickable overlays below, not the board's own
    size: p.layer === "intelligo" ? "md" : "lg",
    status: p.id === focus ? "active" : related.has(p.id) ? "processing" : "inactive",
  }));

  const connections: CircuitConnection[] = EDGES.map((e) => {
    const lit = e.from === focus || e.to === focus;
    return {
      from: e.from,
      to: e.to,
      animated: lit,
      color: lit ? "var(--accent)" : "color-mix(in srgb, var(--line-strong) 70%, transparent)",
      pulseColor: "var(--accent)",
    };
  });

  const detail = PACKAGES.find((p) => p.id === selected)!;
  const outgoing = EDGES.filter((e) => e.from === selected).map((e) => e.to);
  const incoming = EDGES.filter((e) => e.to === selected).map((e) => e.from);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div ref={wrapRef} className="relative overflow-hidden border border-line-strong bg-paper-raised" style={{ height: H * scale + 2 }}>
        {/* layer labels */}
        {[
          ["your application", 22],
          ["intelligo packages", 150],
          ["postgresql", 345],
        ].map(([l, y]) => (
          <span key={l as string} className="tag absolute left-3" style={{ top: (y as number) * scale }}>
            {l}
          </span>
        ))}
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: W, height: H }}>
          <CircuitBoard
            nodes={nodes}
            connections={connections}
            width={W}
            height={H}
            variant={variant}
            gridSize={24}
            traceWidth={1.5}
            pulseSpeed={2.4}
            gridColor="color-mix(in srgb, var(--line-strong) 60%, transparent)"
            nodeColor="var(--line-strong)"
          />
          {/* clickable overlays with labels (CircuitBoard nodes are decorative) */}
          {PACKAGES.map((p) => {
            const { x, y } = POS[p.id]!;
            const isFocus = p.id === focus;
            const isRelated = related.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onMouseEnter={() => setHover(p.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(p.id)}
                onBlur={() => setHover(null)}
                onClick={() => setSelected(p.id)}
                aria-pressed={selected === p.id}
                className={cn(
                  "mono absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap border px-2 py-1 text-[0.72rem] transition-all",
                  isFocus
                    ? "border-amber bg-amber-soft text-amber"
                    : isRelated
                      ? "border-line-strong bg-paper text-ink"
                      : "border-line bg-paper text-ink-faint opacity-60",
                  p.layer === "db" && "rounded-full px-3"
                )}
                style={{ left: x, top: y }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="rounded-md border border-line bg-paper-raised p-4">
        <div className="mono text-[0.72rem] text-ink-faint">
          {detail.layer === "intelligo" ? "@intelligo-dev/" : detail.layer === "app" ? "your app · " : ""}
          <span className="text-ink">{detail.label}</span>
        </div>
        <p className="mt-2 text-[0.95rem] font-medium text-ink">{detail.summary}</p>
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-[0.85rem] text-ink-dim">
          {detail.bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="text-settle">✓</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <div className="mono mt-4 space-y-1 border-t border-line pt-3 text-[0.7rem] text-ink-faint">
          <div>
            imports → <span className="text-ink-dim">{outgoing.length ? outgoing.join(", ") : "nothing"}</span>
          </div>
          <div>
            imported by ← <span className="text-ink-dim">{incoming.length ? incoming.join(", ") : "nothing"}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
