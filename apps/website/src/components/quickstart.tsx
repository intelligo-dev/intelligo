import { useState } from "react";
import { QUICKSTART as STEPS } from "@/lib/quickstart";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/copy-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Typewriter } from "@/components/elements/typewriter";

export function Quickstart() {
  const [i, setI] = useState(0);
  const s = STEPS[i]!;

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <ol className="border-t border-border">
          {STEPS.map((st, n) => (
            <li
              key={st.title}
              className={cn(
                "flex items-start gap-1 border-b border-border pr-2 transition-colors",
                n === i && "bg-card"
              )}
            >
              <button
                type="button"
                onMouseEnter={() => setI(n)}
                onFocus={() => setI(n)}
                onClick={() => setI(n)}
                className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left"
              >
                <span
                  className={cn(
                    "mono mt-0.5 text-[0.72rem] tabular-nums",
                    n === i ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  0{n + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mono block text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground">
                    {st.title}
                  </span>
                  <span className="mono mt-0.5 block overflow-x-auto whitespace-nowrap text-[0.8rem] text-foreground [scrollbar-width:none]">
                    $ {st.cmd}
                  </span>
                  <span className="mt-1 block text-[0.82rem] text-foreground/70">
                    {st.note}
                  </span>
                </span>
              </button>
              <CopyButton text={st.cmd} className="mt-2.5 shrink-0" />
            </li>
          ))}
        </ol>

        <div className="rounded-xl border border-border bg-muted">
          <div className="flex h-8 items-center gap-1.5 border-b border-border px-3">
            <span className="size-2 rounded-full bg-foreground/15" />
            <span className="size-2 rounded-full bg-foreground/15" />
            <span className="size-2 rounded-full bg-foreground/15" />
            <span className="mono ml-2 text-[0.7rem] text-muted-foreground">
              my-app — zsh
            </span>
          </div>
          <div className="mono min-h-[240px] overflow-x-auto p-4 text-[0.78rem] leading-relaxed">
            <div className="text-foreground">
              <span className="text-muted-foreground">$ </span>
              <Typewriter key={i} text={s.cmd} speed={12} cursor={false} />
            </div>
            <div className="mt-2 space-y-0.5">
              {s.out.map((o, n) => (
                <div
                  key={`${n}-${o}`}
                  className={cn(
                    "animate-in fade-in min-h-[1em] whitespace-pre",
                    o.startsWith("✓")
                      ? "text-success"
                      : o.startsWith("▲")
                        ? "text-foreground"
                        : "text-foreground/70"
                  )}
                  style={{
                    animationDelay: `${400 + n * 140}ms`,
                    animationFillMode: "backwards",
                  }}
                >
                  {o}
                </div>
              ))}
            </div>
            <span
              className="cursor-blink mt-1 inline-block h-[1.05em] w-[7px] bg-foreground align-text-bottom"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
