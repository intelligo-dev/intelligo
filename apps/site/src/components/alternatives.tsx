import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ALTERNATIVES } from "@/lib/alternatives";

export function Alternatives() {
  const [id, setId] = useState(ALTERNATIVES[0]!.id);

  useEffect(() => {
    const m = location.hash.match(/compare=([a-z-]+)/);
    if (m && ALTERNATIVES.some((a) => a.id === m[1])) setId(m[1]!);
  }, []);

  const pick = (next: string) => {
    setId(next);
    try {
      history.replaceState(null, "", `#compare=${next}`);
    } catch {}
  };

  const a = ALTERNATIVES.find((x) => x.id === id)!;

  return (
    <div className="grid gap-5 md:grid-cols-[300px_1fr]">
      <div>
        <div className="tag mb-2">if you would otherwise…</div>
        <div
          className="flex flex-col border-t border-border"
          role="tablist"
          aria-label="Alternatives"
        >
          {ALTERNATIVES.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={x.id === id}
              onClick={() => pick(x.id)}
              className={cn(
                "flex items-center justify-between gap-3 border-b border-border py-2.5 text-left text-[0.92rem] transition-colors",
                x.id === id
                  ? "text-foreground"
                  : "text-foreground/70 hover:text-foreground"
              )}
            >
              {x.option}
              <span
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

      <div className="rounded-md border border-border bg-card p-5 md:p-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
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
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
