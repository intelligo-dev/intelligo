import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { WALKTHROUGH, type WalkthroughStep } from "@/lib/walkthrough";
import { Showcase, type SceneId } from "@/showcase/scenes";

const STEP_MS = 2800;

/* ---------- the one sketched surface: the admin console ---------- */

function Pill({
  children,
  tone = "ink",
}: {
  children: React.ReactNode;
  tone?: "ink" | "amber" | "settle" | "fail";
}) {
  const tones = {
    ink: "border-line text-ink-dim",
    amber: "border-amber text-amber",
    settle: "border-settle text-settle",
    fail: "border-fail text-fail",
  };
  return (
    <span
      className={cn(
        "mono inline-block rounded-full border px-1.5 py-px text-[9px] leading-tight",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

const NAV_ITEMS = [
  "dashboard",
  "chat",
  "artifacts",
  "usage",
  "settings",
  "admin",
];

function Shell({
  active,
  title,
  children,
  right,
}: {
  active: string;
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="grid h-full grid-cols-[92px_1fr] bg-paper">
      <aside className="flex flex-col gap-2 border-r border-line bg-paper-raised p-2.5">
        <div className="mono flex items-center gap-1 rounded-sm border border-line px-1.5 py-1 text-[9px] text-ink">
          <span className="inline-block size-1.5 bg-amber" /> Acme{" "}
          <span className="ml-auto text-ink-faint">▾</span>
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
          <span className="inline-block size-3 rounded-full bg-line-strong" />{" "}
          you
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

function SceneAdmin() {
  return (
    <Shell
      active="admin"
      title="Admin · platform"
      right={<Pill tone="fail">impersonating maria — audited</Pill>}
    >
      <div className="grid grid-cols-3 gap-1.5">
        {[
          ["workspaces", "212"],
          ["running", "3"],
          ["failed 24h", "0"],
        ].map(([l, v]) => (
          <div key={l} className="border border-line p-1.5">
            <div className="mono text-[8px] text-ink-faint">{l}</div>
            <div className="mono text-[12px] text-ink">{v}</div>
          </div>
        ))}
      </div>
      <div className="mono mt-2 text-[8px] text-ink-faint">audit</div>
      {[
        "execution.settled · acme · chat.message",
        "member.role_changed · acme · li → admin",
        "impersonation.started · maria",
      ].map((e) => (
        <div
          key={e}
          className="mono border-t border-line py-1 text-[8.5px] text-ink-dim"
        >
          {e}
        </div>
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

function Scene({ step }: { step: WalkthroughStep }) {
  const real = REAL[step.scene];
  if (real) return <Showcase scene={real} />;
  return <SceneAdmin />;
}

/* ---------- the walkthrough ---------- */

export function ProductWalkthrough() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const step = WALKTHROUGH[i]!;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setVisible(!!e?.isIntersecting),
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const playing = visible && !paused && !reduce;

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(
      () => setI((n) => (n + 1) % WALKTHROUGH.length),
      STEP_MS
    );
    return () => window.clearTimeout(t);
  }, [playing, i]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setI((n) => (n + 1) % WALKTHROUGH.length);
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setI((n) => (n - 1 + WALKTHROUGH.length) % WALKTHROUGH.length);
    }
  };

  const meta: [string, string][] = [
    ["route", step.route],
    ["registry item", step.item],
    ["service", step.pkg],
    ["ui ownership", step.ownership],
  ];

  return (
    <div
      ref={root}
      className="grid gap-4 md:grid-cols-[150px_1fr]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onKeyDown={onKey}
      tabIndex={0}
      aria-label="Reference application walkthrough. Use left and right arrow keys to move between steps."
    >
      {/* rail */}
      <ol
        className="mono flex gap-1 overflow-x-auto md:flex-col md:gap-0 md:overflow-visible"
        aria-label="Steps"
      >
        {WALKTHROUGH.map((s, n) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setI(n)}
              aria-current={n === i ? "step" : undefined}
              className={cn(
                "group relative flex w-full items-center gap-2 whitespace-nowrap border-l-2 py-1.5 pl-3 pr-2 text-left text-[0.78rem] transition-colors md:py-[7px]",
                n === i
                  ? "border-amber text-ink"
                  : "border-line text-ink-faint hover:text-ink-dim",
                n < i && "text-ink-dim"
              )}
            >
              <span
                className={cn(
                  "hidden size-1.5 rounded-full md:inline-block",
                  n === i ? "bg-amber" : n < i ? "bg-settle" : "bg-line-strong"
                )}
              />
              {s.label}
              {n === i && playing && (
                <motion.span
                  key={i}
                  className="absolute bottom-0 left-0 h-px bg-amber"
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: STEP_MS / 1000, ease: "linear" }}
                />
              )}
            </button>
          </li>
        ))}
      </ol>

      {/* browser + the mapping to the capability underneath */}
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
                <Scene step={step} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <dl className="mono mt-2 grid grid-cols-2 gap-px border border-line bg-line text-[0.72rem] sm:grid-cols-4">
          {meta.map(([k, v]) => (
            <div key={k} className="bg-paper px-3 py-2">
              <dt className="text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint">
                {k}
              </dt>
              <dd
                className={cn(
                  "mt-0.5 truncate",
                  v === "package runtime" ? "text-amber" : "text-ink"
                )}
              >
                {v}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mono mt-2 flex items-center justify-between gap-3 text-[0.7rem] text-ink-faint">
          <span>
            every screen but admin is the installed registry item, rendered from
            the same files <span className="text-ink-dim">shadcn add</span>{" "}
            writes
          </span>
          <span className="hidden whitespace-nowrap sm:inline">
            {paused ? "paused" : playing ? "auto-playing" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
