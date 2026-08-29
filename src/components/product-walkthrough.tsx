import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { AGENT_FRAMEWORKS, WALKTHROUGH, type WalkthroughStep } from "@/lib/walkthrough";
import { Showcase, type SceneId } from "@/showcase/scenes";

const STEP_MS = 2800;

/* ---------- mini UI vocabulary (HTML/CSS, themed, no screenshots) ---------- */

function Line({ w = "w-24", className }: { w?: string; className?: string }) {
  return <span className={cn("block h-1.5 rounded-sm bg-line", w, className)} />;
}

function Pill({ children, tone = "ink" }: { children: React.ReactNode; tone?: "ink" | "amber" | "settle" | "fail" }) {
  const tones = {
    ink: "border-line text-ink-dim",
    amber: "border-amber text-amber",
    settle: "border-settle text-settle",
    fail: "border-fail text-fail",
  };
  return (
    <span className={cn("mono inline-block rounded-full border px-1.5 py-px text-[9px] leading-tight", tones[tone])}>
      {children}
    </span>
  );
}

function Btn({ children, primary }: { children: React.ReactNode; primary?: boolean }) {
  return (
    <span
      className={cn(
        "mono inline-block rounded-sm px-2 py-1 text-[9px] leading-none",
        primary ? "bg-ink text-paper" : "border border-line-strong text-ink-dim"
      )}
    >
      {children}
    </span>
  );
}

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center bg-paper-sunken p-4">
      <div className="w-[min(100%,220px)] border border-line-strong bg-paper-raised p-3.5">
        <div className="mono mb-2 flex items-center gap-1.5 text-[10px] font-semibold">
          <span className="inline-block size-1.5 bg-amber" /> intelligo
        </div>
        <div className="mb-2 text-[11px] font-semibold text-ink">{title}</div>
        {children}
      </div>
    </div>
  );
}

const NAV_ITEMS = ["dashboard", "chat", "artifacts", "usage", "settings", "admin"];

function Shell({ active, title, children, right }: { active: string; title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="grid h-full grid-cols-[92px_1fr] bg-paper">
      <aside className="flex flex-col gap-2 border-r border-line bg-paper-raised p-2.5">
        <div className="mono flex items-center gap-1 rounded-sm border border-line px-1.5 py-1 text-[9px] text-ink">
          <span className="inline-block size-1.5 bg-amber" /> Acme <span className="ml-auto text-ink-faint">▾</span>
        </div>
        <div className="mt-1 flex flex-col gap-1">
          {NAV_ITEMS.map((n) => (
            <span
              key={n}
              className={cn(
                "mono rounded-sm px-1.5 py-[3px] text-[9px]",
                n === active ? "bg-amber-soft text-amber" : "text-ink-faint"
              )}
            >
              {n}
            </span>
          ))}
        </div>
        <div className="mono mt-auto flex items-center gap-1 text-[9px] text-ink-faint">
          <span className="inline-block size-3 rounded-full bg-line-strong" /> you
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <div className="flex h-7 items-center justify-between border-b border-line px-3">
          <span className="text-[10px] font-semibold text-ink">{title}</span>
          <div className="flex items-center gap-1.5">{right}</div>
        </div>
        <div className="min-h-0 flex-1 p-3">{children}</div>
      </div>
    </div>
  );
}

/* ---------- scenes ---------- */








function SceneChat({ frameworkIndex }: { frameworkIndex: number }) {
  return (
    <Shell active="chat" title="New conversation" right={<Pill tone="settle">stub model</Pill>}>
      <div className="flex h-full flex-col gap-1.5">
        <div className="self-end rounded-sm bg-paper-sunken px-2 py-1 text-[9px] text-ink">What's in this quarter's tickets?</div>
        <div className="rounded-sm border border-line px-2 py-1 text-[9px] text-ink-dim">
          Three themes: onboarding friction, billing questions, and export requests…
        </div>
        <div className="relative mt-auto border border-dashed border-amber bg-amber-soft/60 px-2 py-1.5">
          <div className="mono text-[8px] uppercase tracking-wide text-amber">your agent goes here</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink">
            <AnimatePresence mode="wait">
              <motion.span
                key={frameworkIndex}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="font-semibold"
              >
                {AGENT_FRAMEWORKS[frameworkIndex % AGENT_FRAMEWORKS.length]}
              </motion.span>
            </AnimatePresence>
            <span className="text-ink-faint">— unmodified</span>
          </div>
        </div>
      </div>
    </Shell>
  );
}


function SceneAdmin() {
  return (
    <Shell active="admin" title="Admin · platform" right={<Pill tone="fail">impersonating maria — audited</Pill>}>
      <div className="grid grid-cols-3 gap-1.5">
        {[["workspaces", "212"], ["running", "3"], ["failed 24h", "0"]].map(([l, v]) => (
          <div key={l} className="border border-line p-1.5">
            <div className="mono text-[8px] text-ink-faint">{l}</div>
            <div className="mono text-[12px] text-ink">{v}</div>
          </div>
        ))}
      </div>
      <div className="mono mt-2 text-[8px] text-ink-faint">audit</div>
      {["execution.settled · acme · chat.message", "member.role_changed · acme · li → admin", "impersonation.started · maria"].map((e) => (
        <div key={e} className="mono border-t border-line py-1 text-[8.5px] text-ink-dim">{e}</div>
      ))}
    </Shell>
  );
}

/**
 * Every step but the admin console is the real registry item, rendered
 * from the same files `shadcn add` installs (see src/showcase). The
 * admin console is a package, not a registry item, so it keeps the
 * sketch.
 */
const REAL: Partial<Record<WalkthroughStep["scene"], SceneId>> = {
  signup: "signup",
  verify: "verify",
  workspace: "onboarding",
  dashboard: "dashboard",
  team: "team",
  billing: "pricing",
  usage: "usage",
  chat: "chat",
  artifacts: "artifacts",
};

function Scene({ step, frameworkIndex }: { step: WalkthroughStep; frameworkIndex: number }) {
  const real = REAL[step.scene];
  if (real) return <Showcase scene={real} />;
  if (step.scene === "chat") return <SceneChat frameworkIndex={frameworkIndex} />;
  return <SceneAdmin />;
}

/* ---------- the walkthrough ---------- */

export function ProductWalkthrough() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [fw, setFw] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const step = WALKTHROUGH[i]!;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const playing = visible && !paused && !reduce;

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setI((n) => (n + 1) % WALKTHROUGH.length), step.scene === "chat" ? STEP_MS * 1.6 : STEP_MS);
    return () => window.clearTimeout(t);
  }, [playing, i, step.scene]);

  useEffect(() => {
    if (step.scene !== "chat") return;
    const t = window.setInterval(() => setFw((n) => n + 1), 1200);
    return () => window.clearInterval(t);
  }, [step.scene]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setI((n) => (n + 1) % WALKTHROUGH.length); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setI((n) => (n - 1 + WALKTHROUGH.length) % WALKTHROUGH.length); }
  };

  return (
    <div
      ref={root}
      className="grid gap-4 md:grid-cols-[150px_1fr]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onKeyDown={onKey}
      tabIndex={0}
      aria-label="Product walkthrough. Use left and right arrow keys to move between steps."
    >
      {/* rail */}
      <ol className="mono flex gap-1 overflow-x-auto md:flex-col md:gap-0 md:overflow-visible" aria-label="Steps">
        {WALKTHROUGH.map((s, n) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setI(n)}
              aria-current={n === i ? "step" : undefined}
              className={cn(
                "group relative flex w-full items-center gap-2 whitespace-nowrap border-l-2 py-1.5 pl-3 pr-2 text-left text-[0.78rem] transition-colors md:py-[7px]",
                n === i ? "border-amber text-ink" : "border-line text-ink-faint hover:text-ink-dim",
                n < i && "text-ink-dim"
              )}
            >
              <span className={cn("hidden size-1.5 rounded-full md:inline-block", n === i ? "bg-amber" : n < i ? "bg-settle" : "bg-line-strong")} />
              {s.label}
              {n === i && playing && (
                <motion.span
                  key={i}
                  className="absolute bottom-0 left-0 h-px bg-amber"
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: (step.scene === "chat" ? STEP_MS * 1.6 : STEP_MS) / 1000, ease: "linear" }}
                />
              )}
            </button>
          </li>
        ))}
      </ol>

      {/* browser */}
      <div>
        <div className="rounded-md border border-line bg-paper-raised">
          <div className="flex h-8 items-center gap-2 border-b border-line px-3">
            <span className="flex gap-1">
              <span className="size-2 rounded-full bg-line-strong" />
              <span className="size-2 rounded-full bg-line-strong" />
              <span className="size-2 rounded-full bg-line-strong" />
            </span>
            <span className="mono ml-2 flex-1 truncate rounded-sm border border-line bg-paper px-2 py-0.5 text-[0.7rem] text-ink-faint">
              app.example.com<span className="text-ink">{step.route}</span>
            </span>
            <span className="mono rounded-full border border-amber bg-amber-soft px-2 py-px text-[0.66rem] text-amber">
              {step.hotspot}
            </span>
          </div>
          <div className="relative h-[340px] overflow-hidden sm:h-[380px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step.id}
                className="absolute inset-0"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <Scene step={step} frameworkIndex={fw} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <div className="mono mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.72rem] text-ink-faint">
          <span>
            item <span className="text-ink">{step.item}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            package <span className="text-ink">{step.pkg}</span>
          </span>
          <span className="ml-auto hidden sm:inline">{paused ? "paused" : playing ? "auto-playing" : ""}</span>
        </div>
      </div>
    </div>
  );
}
