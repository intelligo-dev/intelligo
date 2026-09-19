import { useState } from "react";
import { installCommand } from "@/lib/install";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/copy-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Typewriter } from "@/components/elements/typewriter";

/**
 * Three steps, every command real:
 *   1. `intelligo create` — the published CLI (bin: intelligo); the
 *      "Next:" lines are what it prints (packages/cli/src/commands/create.ts).
 *   2. `shadcn add <url>` — the hosted registry this site serves at /r.
 *   3. `pnpm dev` — the scaffold's own script.
 * Database, env and provider setup are in the docs, not here.
 */
const STEPS = [
  {
    title: "Create",
    cmd: "pnpm dlx @intelligo-dev/cli@beta create my-app",
    note: "Next.js 16, shadcn, Tailwind 4, next-intl, a composition root wired to the execution boundary.",
    out: [
      "✓ my-app/lib/intelligo.ts — composition root",
      "✓ my-app/lib/plans.ts",
      "✓ my-app/intelligo.manifest.json — generated files hashed",
      "",
      "Next:",
      "  cd my-app",
      "  cp .env.example .env.local   # then fill it in",
      "  pnpm install",
      "  pnpm dev",
    ],
  },
  {
    title: "Add UI",
    cmd: installCommand("app-shell"),
    note: "Repeat per page family. Each lands as your own source.",
    out: [
      "✓ app/[locale]/(app)/layout.tsx",
      "✓ components/shell/*.tsx",
      "✓ lib/nav-config.ts · lib/shell-config.tsx",
      "✓ messages/en/app-shell.json",
    ],
  },
  {
    title: "Run",
    cmd: "pnpm dev",
    note: "Set DATABASE_URL and BETTER_AUTH_SECRET in .env.local first. Chat streams against a built-in stub model — no provider key needed yet.",
    out: [
      "▲ ready on http://localhost:3000",
      "sign-up → workspace → billing → chat",
    ],
  },
];

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
