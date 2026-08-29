import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { CliOutput } from "@/components/elements/cli-output";

/**
 * `intelligo doctor`, line by line. Uses @elements/cli-output for the
 * terminal and ANSI parsing; the typing is a simple scheduler so the
 * run can be restarted.
 */
const SCRIPT: { text: string; ms: number }[] = [
  { text: "intelligo doctor", ms: 300 },
  { text: "\x1b[90mreading intelligo.lock · 12 generated files\x1b[0m", ms: 420 },
  { text: "\x1b[32m✓\x1b[0m lib/intelligo.ts — composition root, unchanged", ms: 160 },
  { text: "\x1b[32m✓\x1b[0m lib/plans.ts — unchanged", ms: 140 },
  { text: "\x1b[33m●\x1b[0m lib/nav-config.ts — customized (hash differs), will not clobber", ms: 220 },
  { text: "\x1b[33m●\x1b[0m lib/chat-config.tsx — customized, will not clobber", ms: 200 },
  { text: "\x1b[32m✓\x1b[0m migrations — up to date with @intelligo-dev/core 0.4.0", ms: 260 },
  { text: "\x1b[32m✓\x1b[0m model ids — 3 used, 3 registered", ms: 200 },
  { text: "\x1b[90mno problems found\x1b[0m", ms: 500 },
  { text: "intelligo upgrade --check", ms: 300 },
  { text: "\x1b[90m@intelligo-dev/auth 0.4.0 → 0.5.0\x1b[0m", ms: 260 },
  { text: "\x1b[33m1 codemod available\x1b[0m · rename requireWorkspace → requireActiveWorkspace", ms: 220 },
  { text: "\x1b[32m0 breaking\x1b[0m · your 2 customized files are untouched", ms: 200 },
];

export function DoctorTerminal({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const timers = useRef<number[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const played = useRef(false);

  const run = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setLines([]);
    setRunning(true);
    let t = 0;
    SCRIPT.forEach((s, i) => {
      t += reduce ? 40 : s.ms;
      timers.current.push(
        window.setTimeout(() => {
          setLines((l) => [...l, s.text]);
          if (i === SCRIPT.length - 1) setRunning(false);
        }, t)
      );
    });
  };

  useEffect(() => {
    if (!root.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && !played.current) {
        played.current = true;
        run();
      }
    }, { threshold: 0.4 });
    io.observe(root.current);
    return () => {
      io.disconnect();
      timers.current.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CliOutput prefixes every line with `prompt`; we want it only on commands
  const output = lines.map((l, i) => ({ id: `l${i}`, text: l.startsWith("intelligo ") ? `\x1b[33m$\x1b[0m ${l}` : l }));

  return (
    <div ref={root} className={className}>
      <CliOutput output={output} prompt="" showControls={false} className={cn("min-h-[300px] text-[0.78rem]")} />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="mono rounded-md border border-line-strong px-3 py-1.5 text-[0.74rem] text-ink transition-colors hover:border-amber hover:text-amber disabled:opacity-60"
        >
          {running ? "running…" : "Run doctor again"}
        </button>
        <span className="mono text-[0.7rem] text-ink-faint">never overwrites what you changed</span>
      </div>
    </div>
  );
}
