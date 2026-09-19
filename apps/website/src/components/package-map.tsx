import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { EDGES, PACKAGES } from "@/lib/packages";

/**
 * The package map. Packages sit in rows by how much of the framework
 * they stand on — `core` at the bottom, `chat` at the top — so every
 * import points down, and the database is a bar under all of them. The
 * columns are chosen so that no edge passes behind a package it does
 * not touch. Hover or focus lights a package's own edges: what it
 * imports as solid lines, what imports it as dashed ones; click opens
 * its detail.
 *
 * The board is a 760px drawing. Scaled to a phone it is five-pixel
 * labels on ten-pixel buttons, so below `md` the same packages are a
 * plain list of the three layers, driving the same detail panel.
 */
const W = 760;
const H = 496;
/** Half the height of a package's button: where its edges attach. */
const NODE_HALF = 14;
const DB_TOP = 446;

const LAYERS = [
  ["app", "your application"],
  ["intelligo", "intelligo packages"],
  ["db", "postgresql"],
] as const;

const POS: Record<string, { x: number; y: number }> = {
  pages: { x: 107, y: 46 },
  actions: { x: 350, y: 46 },
  agent: { x: 532, y: 46 },
  chat: { x: 410, y: 140 },
  admin: { x: 167, y: 202 },
  mastra: { x: 532, y: 202 },
  billing: { x: 653, y: 202 },
  next: { x: 350, y: 264 },
  executions: { x: 471, y: 264 },
  jobs: { x: 46, y: 326 },
  auth: { x: 167, y: 326 },
  audit: { x: 289, y: 326 },
  core: { x: 410, y: 388 },
  cli: { x: 532, y: 388 },
};

/** An import, drawn from the importer down to what it imports. */
function edgePath(from: string, to: string): string {
  const a = POS[from]!;
  if (to === "db") return `M${a.x},${a.y + NODE_HALF} V${DB_TOP}`;
  const b = POS[to]!;
  if (a.y === b.y) return `M${a.x},${a.y} H${b.x}`;
  const y1 = a.y + NODE_HALF;
  const y2 = b.y - NODE_HALF;
  const mid = (y1 + y2) / 2;
  return `M${a.x},${y1} C${a.x},${mid} ${b.x},${mid} ${b.x},${y2}`;
}

export function PackageMap() {
  const [selected, setSelected] = useState("executions");
  const [hover, setHover] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setScale(Math.min(1, (e?.contentRect.width ?? W) / W))
    );
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

  const detail = PACKAGES.find((p) => p.id === selected)!;
  const labelOf = (id: string) =>
    PACKAGES.find((p) => p.id === id)?.label ?? id;
  const outgoing = EDGES.filter((e) => e.from === selected).map((e) =>
    labelOf(e.to)
  );
  const incoming = EDGES.filter((e) => e.to === selected).map((e) =>
    labelOf(e.from)
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4 md:hidden">
        {LAYERS.map(([layer, title]) => (
          <div key={layer}>
            <div className="tag mb-2">{title}</div>
            <div className="flex flex-wrap gap-1.5">
              {PACKAGES.filter((p) => p.layer === layer).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p.id)}
                  aria-pressed={selected === p.id}
                  className={cn(
                    "mono min-h-10 rounded-lg border px-3 text-[0.8rem] transition-colors",
                    selected === p.id
                      ? "border-foreground bg-foreground text-background"
                      : related.has(p.id)
                        ? "border-foreground/30 bg-background text-foreground"
                        : "border-border bg-background text-muted-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div
        ref={wrapRef}
        className="relative hidden overflow-hidden rounded-xl border border-border bg-card md:block"
        style={{ height: H * scale + 2 }}
      >
        {[
          ["your application", 8],
          ["intelligo packages", 96],
        ].map(([l, y]) => (
          <span
            key={l as string}
            className="tag absolute left-3"
            style={{ top: (y as number) * scale }}
          >
            {l}
          </span>
        ))}
        <span
          className="mono absolute right-3 text-[0.62rem] text-muted-foreground"
          style={{ top: 10 * scale }}
        >
          ── imports &nbsp; ╌╌ imported by
        </span>
        <div
          className="relative mx-auto"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: W,
            height: H,
          }}
        >
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            aria-hidden="true"
            className="absolute inset-0"
          >
            {/* lit edges last, so they sit above the quiet ones */}
            {[...EDGES]
              .sort(
                (a, b) =>
                  Number(a.from === focus || a.to === focus) -
                  Number(b.from === focus || b.to === focus)
              )
              .map((e) => {
                const imports = e.from === focus;
                const importedBy = e.to === focus;
                return (
                  <path
                    key={`${e.from}-${e.to}`}
                    d={edgePath(e.from, e.to)}
                    fill="none"
                    strokeLinecap="round"
                    strokeWidth={imports || importedBy ? 1.5 : 1}
                    strokeDasharray={importedBy ? "4 4" : undefined}
                    className={cn(
                      "transition-[stroke,opacity] duration-200",
                      imports || importedBy
                        ? "stroke-foreground"
                        : "stroke-foreground/10"
                    )}
                  />
                );
              })}
          </svg>
          {PACKAGES.map((p) => {
            const isFocus = p.id === focus;
            const isRelated = related.has(p.id);
            const state = isFocus
              ? "border-foreground bg-muted text-foreground"
              : isRelated
                ? "border-foreground/30 bg-background text-foreground"
                : "border-border bg-background text-muted-foreground";
            const handlers = {
              onMouseEnter: () => setHover(p.id),
              onMouseLeave: () => setHover(null),
              onFocus: () => setHover(p.id),
              onBlur: () => setHover(null),
              onClick: () => setSelected(p.id),
            };
            if (p.layer === "db") {
              return (
                <button
                  key={p.id}
                  type="button"
                  {...handlers}
                  aria-pressed={selected === p.id}
                  className={cn(
                    "mono absolute inset-x-3 rounded-lg border py-1.5 text-center text-[0.72rem] transition-colors",
                    state
                  )}
                  style={{ top: DB_TOP }}
                >
                  {p.label}
                </button>
              );
            }
            const { x, y } = POS[p.id]!;
            return (
              <button
                key={p.id}
                type="button"
                {...handlers}
                aria-pressed={selected === p.id}
                className={cn(
                  "mono absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border px-2 py-1 text-[0.72rem] transition-colors",
                  state
                )}
                style={{ left: x, top: y }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="rounded-xl border border-border bg-card p-4">
        <div className="mono text-[0.72rem] text-muted-foreground">
          {detail.layer === "intelligo"
            ? "@intelligo-dev/"
            : detail.layer === "app"
              ? "your app · "
              : ""}
          <span className="text-foreground">{detail.label}</span>
        </div>
        <p className="mt-2 text-[0.95rem] font-medium text-foreground">
          {detail.summary}
        </p>
        <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-[0.85rem] text-foreground/70">
          {detail.bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="text-success">✓</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <div className="mono mt-4 space-y-1 border-t border-border pt-3 text-[0.7rem] text-muted-foreground">
          <div>
            imports →{" "}
            <span className="text-foreground/70">
              {outgoing.length ? outgoing.join(", ") : "nothing"}
            </span>
          </div>
          <div>
            imported by ←{" "}
            <span className="text-foreground/70">
              {incoming.length ? incoming.join(", ") : "nothing"}
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
