import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { RULES } from "@/lib/rules";

/** Four rules. Break one and read the assertion the real test emits. */
export function RuleToggles() {
  const [broken, setBroken] = useState<string | null>(null);

  return (
    <div className="grid gap-1.5">
      {RULES.map((r) => {
        const on = broken === r.id;
        return (
          <div key={r.id} className={cn("border transition-colors", on ? "border-fail" : "border-line")}>
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[0.95rem] font-medium text-ink">{r.title}</div>
                <div className="text-[0.84rem] text-ink-dim">{r.body}</div>
                <div className="mono mt-0.5 truncate text-[0.66rem] text-ink-faint">{r.file}</div>
              </div>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setBroken(on ? null : r.id)}
                className={cn(
                  "mono rounded-md border px-2.5 py-1 text-[0.72rem] transition-colors",
                  on ? "border-fail bg-fail-soft text-fail" : "border-line-strong text-ink-dim hover:text-ink"
                )}
              >
                {on ? "restore" : "break it"}
              </button>
            </div>
            <AnimatePresence initial={false}>
              {on ? (
                <motion.div
                  key="out"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="overflow-hidden"
                >
                  <div className="mono border-t border-line bg-paper-sunken px-4 py-3 text-[0.74rem] leading-relaxed">
                    <div className="text-ink-dim">
                      <span className="text-fail">−</span> {r.violation}
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {r.output.map((l, i) => (
                        <div key={i} className={cn(i === 0 ? "text-fail" : l.startsWith("×") ? "text-fail" : "text-ink-dim")}>{l}</div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mono border-t border-line px-4 py-1.5 text-[0.7rem] text-settle">
                  {r.passing}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
