import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * The execution boundary as a state machine you can drive: three
 * scenarios, one ledger. Numbers are illustrative; the transitions
 * are the real ones (ADR-0007).
 */
type Scenario = "run" | "refuse" | "fail";
type Phase = "idle" | "request" | "admit" | "agent" | "settle" | "refuse" | "fail";

const HOLD = 120;
const CHARGE = 83;
const START = 1000;

const SCRIPT: Record<Scenario, { phase: Phase; ms: number }[]> = {
  run: [
    { phase: "request", ms: 500 },
    { phase: "admit", ms: 900 },
    { phase: "agent", ms: 1400 },
    { phase: "settle", ms: 1200 },
  ],
  refuse: [
    { phase: "request", ms: 500 },
    { phase: "refuse", ms: 1400 },
  ],
  fail: [
    { phase: "request", ms: 500 },
    { phase: "admit", ms: 900 },
    { phase: "agent", ms: 900 },
    { phase: "fail", ms: 1300 },
  ],
};

const LABELS: Record<Scenario, string> = { run: "Run", refuse: "Run with 0 credits", fail: "Fail mid-run" };

export function BoundarySimulator({ autoplay = true, className }: { autoplay?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const [scenario, setScenario] = useState<Scenario>("run");
  const [phase, setPhase] = useState<Phase>("idle");
  const [balance, setBalance] = useState(START);
  const [held, setHeld] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const timers = useRef<number[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const played = useRef(false);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const play = (s: Scenario) => {
    clear();
    setScenario(s);
    setBusy(true);
    setPhase("idle");
    setLog([]);
    const start = s === "refuse" ? 0 : balance;
    setBalance(start);
    setHeld(0);
    let t = 0;
    for (const step of SCRIPT[s]) {
      timers.current.push(
        window.setTimeout(() => {
          setPhase(step.phase);
          switch (step.phase) {
            case "request":
              setLog(["POST /api/chat · capability chat.message · model claude-sonnet-5"]);
              break;
            case "admit":
              setHeld(HOLD);
              setLog((l) => [...l, `ADMIT · entitlement ok · hold ${HOLD} credits · execution row written`]);
              break;
            case "agent":
              setLog((l) => [...l, "your framework runs — unmodified"]);
              break;
            case "settle":
              setHeld(0);
              setBalance((b) => b - CHARGE);
              setLog((l) => [...l, `SETTLE · 2,140 tokens · charge ${CHARGE} · hold released · idempotent`]);
              break;
            case "refuse":
              setLog((l) => [...l, "REFUSE · insufficient credits · no hold, no run · audit event written"]);
              break;
            case "fail":
              setHeld(0);
              setLog((l) => [...l, "FAIL · provider timeout · hold released · nothing charged · error recorded"]);
              break;
          }
        }, t)
      );
      t += reduce ? 200 : step.ms;
    }
    timers.current.push(window.setTimeout(() => setBusy(false), t));
  };

  // autoplay once when scrolled into view
  useEffect(() => {
    if (!autoplay || !root.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && !played.current) {
        played.current = true;
        play("run");
      }
    }, { threshold: 0.4 });
    io.observe(root.current);
    return () => { io.disconnect(); clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay]);

  const terminal = phase === "settle" ? "settled" : phase === "refuse" ? "refused" : phase === "fail" ? "failed" : null;

  const stepState = (p: Phase): "done" | "active" | "idle" | "skipped" => {
    const order: Phase[] = ["request", "admit", "agent", phase === "refuse" ? "refuse" : phase === "fail" ? "fail" : "settle"];
    const cur = order.indexOf(phase);
    const idx = order.indexOf(p);
    if (idx < 0) return "skipped";
    if (idx < cur) return "done";
    if (idx === cur) return "active";
    return "idle";
  };

  const rows: { key: Phase; label: string; hint: string }[] = [
    { key: "request", label: "REQUEST", hint: "arrives at your route" },
    { key: "admit", label: "ADMIT", hint: "entitlement · reserve worst case · write row" },
    { key: "agent", label: "YOUR AGENT", hint: "native framework, unmodified" },
    {
      key: phase === "refuse" ? "refuse" : phase === "fail" ? "fail" : "settle",
      label: phase === "refuse" ? "REFUSE" : phase === "fail" ? "FAIL" : "SETTLE",
      hint: phase === "refuse" ? "no hold, no run — audit event" : phase === "fail" ? "hold released, error recorded" : "usage recorded · credits charged · idempotent",
    },
  ];

  return (
    <div ref={root} className={cn("grid gap-4 sm:grid-cols-[1fr_180px]", className)}>
      <div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(LABELS) as Scenario[]).map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => play(s)}
              className={cn(
                "mono rounded-md border px-2.5 py-1 text-[0.72rem] transition-colors disabled:opacity-60",
                scenario === s && phase !== "idle" ? "border-amber bg-amber-soft text-amber" : "border-line-strong text-ink-dim hover:text-ink"
              )}
            >
              {LABELS[s]}
            </button>
          ))}
        </div>

        <ol className="mt-3 border border-line">
          {rows.map((r) => {
            const st = stepState(r.key);
            const isRefuse = r.key === "refuse";
            const isFail = r.key === "fail";
            return (
              <li
                key={r.key}
                className={cn(
                  "flex items-baseline gap-3 border-b border-line px-3 py-2 last:border-b-0 transition-colors",
                  st === "active" && "bg-amber-soft/60",
                  st === "idle" && "opacity-45"
                )}
              >
                <span
                  className={cn(
                    "mono w-[5.5rem] shrink-0 text-[0.7rem] tracking-wide",
                    st === "active" ? (isRefuse ? "text-fail" : isFail ? "text-ink-dim" : "text-amber") : st === "done" ? "text-settle" : "text-ink-faint"
                  )}
                >
                  {st === "done" ? "✓ " : st === "active" ? "▶ " : "· "}
                  {r.label}
                </span>
                <span className="text-[0.82rem] text-ink-dim">{r.hint}</span>
              </li>
            );
          })}
        </ol>

        <div className="mono mt-2 min-h-[3.6rem] space-y-0.5 text-[0.7rem] text-ink-faint" aria-live="polite">
          {log.map((l, i) => (
            <div key={i} className={cn(i === log.length - 1 && "text-ink-dim")}>› {l}</div>
          ))}
        </div>
      </div>

      <div className="relative border border-line-strong bg-paper-raised p-3">
        <div className="tag">credit ledger</div>
        <div className="mono mt-2 text-[1.7rem] leading-none tabular-nums text-ink">{balance.toLocaleString()}</div>
        <div className="mono mt-1 text-[0.7rem] text-ink-faint">available</div>
        <div className="mt-3 h-1.5 w-full overflow-hidden bg-line">
          <motion.div
            className="h-full bg-amber"
            animate={{ width: `${(held / START) * 100 * 4}%` }}
            transition={{ duration: 0.35 }}
          />
        </div>
        <div className="mono mt-1 flex justify-between text-[0.7rem] text-ink-faint">
          <span>held</span>
          <span className={cn(held ? "text-amber" : "")}>{held}</span>
        </div>
        <AnimatePresence>
          {terminal && (
            <motion.span
              key={terminal}
              initial={{ opacity: 0, scale: 1.4 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "stamp absolute bottom-3 right-3",
                terminal === "settled" && "stamp-settled",
                terminal === "refused" && "stamp-refused",
                terminal === "failed" && "stamp-failed"
              )}
            >
              {terminal}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
