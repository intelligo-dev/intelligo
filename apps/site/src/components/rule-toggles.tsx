import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { RULES } from "@/lib/rules";

/** Four rules. Break one and read the assertion the real test emits. */
export function RuleToggles() {
  const [broken, setBroken] = useState<string | null>(null);
  const reduce = useReducedMotion() ?? false;

  return (
    <div className="grid gap-1.5">
      {RULES.map((r) => {
        const on = broken === r.id;
        return (
          <div
            key={r.id}
            className={cn(
              "overflow-hidden rounded-md border transition-colors",
              on ? "border-destructive" : "border-border"
            )}
          >
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[0.95rem] font-medium text-foreground">
                  {r.title}
                </div>
                <div className="text-[0.84rem] text-foreground/70">
                  {r.body}
                </div>
                <div className="mono mt-0.5 truncate text-[0.72rem] text-muted-foreground">
                  {r.file}
                </div>
              </div>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setBroken(on ? null : r.id)}
                className={cn(
                  "mono min-h-9 rounded-md border px-3 text-[0.75rem] transition-colors",
                  on
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-input text-foreground/70 hover:text-foreground"
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
                  transition={{ duration: reduce ? 0 : 0.22 }}
                  className="overflow-hidden"
                >
                  <div className="mono border-t border-border bg-muted px-4 py-3 text-[0.74rem] leading-relaxed">
                    <div className="text-foreground/70">
                      <span className="text-destructive">−</span> {r.violation}
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {r.output.map((l, i) => (
                        <div
                          key={i}
                          className={cn(
                            i === 0
                              ? "text-destructive"
                              : l.startsWith("×")
                                ? "text-destructive"
                                : "text-foreground/70"
                          )}
                        >
                          {l}
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="ok"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mono border-t border-border px-4 py-1.5 text-[0.7rem] text-success"
                >
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
