import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { ALTERNATIVES } from "@/lib/alternatives";

/**
 * Seven alternatives, one answer at a time: a vertical tab list in the
 * full sense — one stop in the tab order, the arrow keys move within it,
 * and the panel says which tab it belongs to. The choice lives in
 * `?compare=`, so `/why#compare` keeps pointing at the section and a
 * copied URL opens on the same answer.
 */
export function Alternatives() {
  const [id, setId] = useState(ALTERNATIVES[0]!.id);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wanted =
      new URLSearchParams(location.search).get("compare") ??
      // links shared before the choice moved out of the hash
      location.hash.match(/compare=([a-z-]+)/)?.[1];
    if (wanted && ALTERNATIVES.some((a) => a.id === wanted)) setId(wanted);
  }, []);

  const pick = (next: string) => {
    setId(next);
    try {
      const url = new URL(location.href);
      url.searchParams.set("compare", next);
      url.hash = "compare";
      history.replaceState(null, "", url);
    } catch {}
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = ALTERNATIVES.findIndex((x) => x.id === id);
    const last = ALTERNATIVES.length - 1;
    const to =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? (i + 1) % ALTERNATIVES.length
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? (i + last) % ALTERNATIVES.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : -1;
    if (to < 0) return;
    e.preventDefault();
    const next = ALTERNATIVES[to]!.id;
    pick(next);
    list.current?.querySelector<HTMLElement>(`#alt-tab-${next}`)?.focus();
  };

  const a = ALTERNATIVES.find((x) => x.id === id)!;

  return (
    <div className="grid gap-5 md:grid-cols-[300px_1fr]">
      <div>
        <div className="tag mb-2">if you would otherwise…</div>
        <div
          ref={list}
          className="flex flex-col border-t border-border"
          role="tablist"
          aria-label="Alternatives"
          aria-orientation="vertical"
          onKeyDown={onKey}
        >
          {ALTERNATIVES.map((x) => (
            <button
              key={x.id}
              id={`alt-tab-${x.id}`}
              type="button"
              role="tab"
              aria-selected={x.id === id}
              aria-controls="alt-panel"
              tabIndex={x.id === id ? 0 : -1}
              onClick={() => pick(x.id)}
              className={cn(
                "flex min-h-11 items-center justify-between gap-3 border-b border-border py-2.5 text-left text-[0.92rem] transition-colors",
                x.id === id
                  ? "font-medium text-foreground"
                  : "text-foreground/70 hover:text-foreground"
              )}
            >
              {x.option}
              <span
                aria-hidden="true"
                className={cn(
                  "mono text-[0.7rem]",
                  x.id === id ? "text-foreground" : "text-muted-foreground"
                )}
              >
                →
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* the new answer fades in over a panel that never empties: nothing
          below it moves twice, and the keyed fade is CSS, so it is already
          still for a reader who asked for less motion */}
      <div
        id="alt-panel"
        role="tabpanel"
        aria-labelledby={`alt-tab-${a.id}`}
        tabIndex={0}
        className="rounded-xl border border-border bg-card p-5 md:min-h-[19rem] md:p-6"
      >
        <div key={a.id} className="animate-in fade-in duration-normal">
          <div className="tag">what's different here</div>
          <p className="mt-2 max-w-[60ch] text-[1.05rem] leading-relaxed text-foreground">
            {a.answer}
          </p>
          <div className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <div>
              <div className="mono text-[0.68rem] tracking-wide text-success">
                what you keep
              </div>
              <ul className="mt-1.5 space-y-1 text-[0.88rem] text-foreground/70">
                {a.keep.map((k) => (
                  <li key={k} className="flex gap-2">
                    <span className="text-success">✓</span>
                    {k}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mono text-[0.68rem] tracking-wide text-destructive">
                what you drop
              </div>
              <ul className="mt-1.5 space-y-1 text-[0.88rem] text-foreground/70">
                {a.drop.map((k) => (
                  <li key={k} className="flex gap-2">
                    <span className="text-destructive">−</span>
                    {k}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
