import { useState } from "react";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/copy-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Typewriter } from "@/components/elements/typewriter";

const STEPS = [
  {
    title: "Install",
    cmd: "pnpm install",
    note: "Node 22 · pnpm 9 · PostgreSQL.",
    out: ["Packages: +1,412", "Done in 24.1s"],
  },
  {
    title: "Create your app",
    cmd: "pnpm dlx @intelligo-dev/cli@beta create my-app",
    note: "shadcn, Tailwind 4, next-intl, a composition root.",
    out: ["✓ my-app/lib/intelligo.ts — composition root", "✓ my-app/lib/plans.ts", "✓ my-app/i18n/routing.ts", "✓ intelligo.manifest.json — generated files hashed"],
  },
  {
    title: "Install the pages",
    cmd: "pnpm exec shadcn add https://intelligo.dev/r/app-shell.json --yes",
    note: "Repeat per item. Each lands as your source.",
    out: ["✓ app/[locale]/(app)/layout.tsx", "✓ components/shell/*.tsx", "✓ lib/nav-config.ts · lib/shell-config.tsx", "✓ messages/en/app-shell.json"],
  },
  {
    title: "Run",
    cmd: "pnpm db:push && pnpm dev",
    note: "Set DATABASE_URL and BETTER_AUTH_SECRET first.",
    out: ["✓ schema pushed", "▲ ready on http://localhost:3000", "sign-up → workspace → billing → chat — no model key yet"],
  },
];

export function Quickstart() {
  const [i, setI] = useState(0);
  const s = STEPS[i]!;

  return (
    <TooltipProvider>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
        <ol className="border-t border-line">
          {STEPS.map((st, n) => (
            <li key={st.title} className={cn("flex items-start gap-1 border-b border-line pr-2 transition-colors", n === i && "bg-paper-raised")}>
              <button type="button" onMouseEnter={() => setI(n)} onFocus={() => setI(n)} onClick={() => setI(n)} className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left">
                <span className={cn("mono mt-0.5 text-[0.72rem] tabular-nums", n === i ? "text-amber" : "text-ink-faint")}>{n + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.95rem] font-medium text-ink">{st.title}</span>
                  <span className="mono mt-0.5 block truncate text-[0.72rem] text-ink-dim">$ {st.cmd}</span>
                  <span className="mt-1 block text-[0.82rem] text-ink-faint">{st.note}</span>
                </span>
              </button>
              <CopyButton text={st.cmd} className="mt-2.5 shrink-0" />
            </li>
          ))}
        </ol>

        <div className="rounded-md border border-line bg-paper-sunken">
          <div className="flex h-8 items-center gap-1.5 border-b border-line px-3">
            <span className="size-2 rounded-full bg-line-strong" /><span className="size-2 rounded-full bg-line-strong" /><span className="size-2 rounded-full bg-line-strong" />
            <span className="mono ml-2 text-[0.66rem] text-ink-faint">my-app — zsh</span>
          </div>
          <div className="mono min-h-[220px] p-4 text-[0.78rem] leading-relaxed">
            <div className="text-ink">
              <span className="text-ink-faint">$ </span>
              <Typewriter key={i} text={s.cmd} speed={12} cursor={false} />
            </div>
            <div className="mt-2 space-y-0.5">
              {s.out.map((o, n) => (
                <div key={o} className={cn("animate-in fade-in", o.startsWith("✓") ? "text-settle" : o.startsWith("▲") ? "text-amber" : "text-ink-dim")} style={{ animationDelay: `${400 + n * 180}ms`, animationFillMode: "backwards" }}>
                  {o}
                </div>
              ))}
            </div>
            <span className="cursor-blink mt-1 inline-block h-[1.05em] w-[7px] bg-amber align-text-bottom" aria-hidden="true" />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
