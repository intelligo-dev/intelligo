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
          className="flex flex-col border-t border-line"
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
                "flex items-center justify-between gap-3 border-b border-line py-2.5 text-left text-[0.92rem] transition-colors",
                x.id === id ? "text-ink" : "text-ink-dim hover:text-ink"
              )}
            >
              {x.option}
              <span
                className={cn(
                  "mono text-[0.7rem]",
                  x.id === id ? "text-amber" : "text-ink-faint"
                )}
              >
                →
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-line bg-paper-raised p-5 md:p-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <div className="tag">what's different here</div>
            <p className="mt-2 max-w-[60ch] text-[1.05rem] leading-relaxed text-ink">
              {a.answer}
            </p>
            <div className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <div>
                <div className="mono text-[0.68rem] tracking-wide text-settle">
                  what you keep
                </div>
                <ul className="mt-1.5 space-y-1 text-[0.88rem] text-ink-dim">
                  {a.keep.map((k) => (
                    <li key={k} className="flex gap-2">
                      <span className="text-settle">✓</span>
                      {k}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mono text-[0.68rem] tracking-wide text-fail">
                  what you drop
                </div>
                <ul className="mt-1.5 space-y-1 text-[0.88rem] text-ink-dim">
                  {a.drop.map((k) => (
                    <li key={k} className="flex gap-2">
                      <span className="text-fail">−</span>
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
