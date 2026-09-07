import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  Bell,
  Bot,
  CreditCard,
  FileText,
  Fingerprint,
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  Activity,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The assembly: a pinned stage where, as the reader scrolls, every part
 * of a workspace AI SaaS flies in and locks into one application — the
 * shell, identity, commerce, execution accounting, product surfaces,
 * operations — and the last slot to fill is the agent. Every part is
 * labelled with the registry item or package that ships it.
 *
 * Scroll progress (0 → 1 over the track) drives every transform; with
 * reduced motion the finished application renders statically.
 */

const W = 960;
const H = 600;

type Phase = {
  id: string;
  label: string;
  src: string;
  /** what the rail shows — short enough for one line */
  short: string;
  note: string;
  /** progress at which this phase's part starts landing */
  at: number;
};

export const PHASES: Phase[] = [
  { id: "shell", label: "The shell", src: "app-shell · dashboard", short: "app-shell", note: "Sidebar, workspace switcher, navigation — installed as your source.", at: 0.06 },
  { id: "identity", label: "Identity", src: "@intelligo-dev/auth", short: "auth", note: "Sign-in, workspaces, roles, invitations. Multi-tenant from the first commit.", at: 0.24 },
  { id: "commerce", label: "Commerce", src: "@intelligo-dev/billing", short: "billing", note: "Plans, entitlements, credits with reservations, Stripe.", at: 0.32 },
  { id: "executions", label: "AI operations", src: "@intelligo-dev/executions", short: "executions", note: "Every run admitted, settled and accounted — usage, cost, audit.", at: 0.4 },
  { id: "product", label: "Product surfaces", src: "chat · artifacts · notifications", short: "chat · core", note: "Conversations, documents, notifications — persisted by core, rendered by pages you own.", at: 0.48 },
  { id: "operations", label: "Operations", src: "jobs · audit · admin", short: "jobs · audit · admin", note: "A Postgres queue, append-only audit events, an operational console.", at: 0.56 },
  { id: "agent", label: "Your agent", src: "Mastra · AI SDK · anything", short: "yours", note: "The only slot you write. Native, unmodified, bracketed by the boundary.", at: 0.8 },
];

/* ---------- a part that lands ---------- */

type Vec = { x?: number; y?: number; r?: number; s?: number };

function Part({
  p,
  from,
  win,
  style,
  className,
  children,
}: {
  p: MotionValue<number>;
  from: Vec;
  win: [number, number];
  style?: React.CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  const x = useTransform(p, win, [from.x ?? 0, 0]);
  const y = useTransform(p, win, [from.y ?? 0, 0]);
  const rotate = useTransform(p, win, [from.r ?? 0, 0]);
  const scale = useTransform(p, win, [from.s ?? 1, 1]);
  const opacity = useTransform(p, [win[0], win[0] + (win[1] - win[0]) * 0.6], [0, 1]);
  return (
    <motion.div
      style={{ ...style, x, y, rotate, scale, opacity }}
      className={cn("absolute will-change-transform", className)}
    >
      {children}
    </motion.div>
  );
}

/* ---------- the parts ---------- */

function Tag({ children, tone = "faint" }: { children: ReactNode; tone?: "faint" | "amber" | "settle" }) {
  return (
    <span
      className={cn(
        "mono inline-block rounded-sm border px-1.5 py-px text-[9px] leading-tight",
        tone === "amber" && "border-amber bg-amber-soft text-amber",
        tone === "settle" && "border-settle/40 text-settle",
        tone === "faint" && "border-line text-ink-faint"
      )}
    >
      {children}
    </span>
  );
}

function Tile({
  title,
  icon: Icon,
  src,
  children,
  className,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  src: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full flex-col rounded-md border border-line bg-paper shadow-[0_12px_30px_-18px_rgba(0,0,0,0.35)]", className)}>
      <div className="flex items-center gap-1.5 border-b border-line px-2.5 py-1.5">
        <Icon className="size-3 text-ink-dim" strokeWidth={1.75} />
        <span className="text-[11px] font-semibold text-ink">{title}</span>
        <span className="mono ml-auto text-[8.5px] text-ink-faint">{src}</span>
      </div>
      <div className="min-h-0 flex-1 p-2.5">{children}</div>
    </div>
  );
}

function Row({ l, r, tone }: { l: string; r: string; tone?: "settle" | "fail" | "amber" }) {
  return (
    <div className="mono flex items-center justify-between border-t border-line py-[3px] text-[9.5px] first:border-t-0">
      <span className="text-ink-dim">{l}</span>
      <span className={cn("text-ink", tone === "settle" && "text-settle", tone === "fail" && "text-fail", tone === "amber" && "text-amber")}>{r}</span>
    </div>
  );
}

const NAV = [
  ["Dashboard", LayoutDashboard],
  ["Chat", MessageSquare],
  ["Artifacts", FileText],
  ["Usage", Activity],
  ["Settings", Wrench],
] as const;

function Stage({ p }: { p: MotionValue<number> }) {
  const SB = 176; // sidebar width
  const TB = 44; // topbar height
  const PAD = 18;
  const cx = SB + PAD;
  const cy = TB + PAD;
  const cw = W - cx - PAD;
  const gap = 12;
  const col3 = (cw - gap * 2) / 3;
  const r1h = 118;
  const r2y = cy + r1h + gap;
  const r2h = H - r2y - PAD;
  const chatW = Math.round(cw * 0.62);
  const rightX = cx + chatW + gap;
  const rightW = cw - chatW - gap;
  const opsH = Math.round((r2h - gap) * 0.52);

  const agentGlow = useTransform(p, [0.8, 0.94], [0, 1]);
  const agentIn = useTransform(p, [0.8, 0.88], [0, 1]);
  const agentScale = useTransform(p, [0.8, 0.94], [0.8, 1]);
  const agentY = useTransform(p, [0.8, 0.94], [30, 0]);

  return (
    <div className="relative" style={{ width: W, height: H }}>
      {/* frame */}
      <Part p={p} from={{ s: 0.96 }} win={[0, 0.1]} style={{ inset: 0 }} className="rounded-xl border border-line-strong bg-paper-raised" >
        <span />
      </Part>

      {/* sidebar */}
      <Part p={p} from={{ x: -260 }} win={[0.06, 0.2]} style={{ left: 0, top: 0, width: SB, height: H }} className="rounded-l-xl border-r border-line bg-paper-sunken/60">
        <div className="flex h-full flex-col p-3">
          <div className="flex items-center gap-2 px-1">
            <span className="inline-block size-3 rounded-[3px] bg-ink" />
            <span className="heading text-[13px] font-semibold text-ink">acme</span>
          </div>
          <div className="mono mt-3 flex items-center justify-between rounded-sm border border-line bg-paper px-2 py-1.5 text-[10px] text-ink">
            Acme Inc <span className="text-ink-faint">▾</span>
          </div>
          <ul className="mt-3 space-y-0.5">
            {NAV.map(([l, I], i) => (
              <li key={l} className={cn("flex items-center gap-2 rounded-sm px-2 py-1.5 text-[11px]", i === 0 ? "bg-paper text-ink" : "text-ink-dim")}>
                <I className="size-3" strokeWidth={1.75} /> {l}
              </li>
            ))}
          </ul>
          <div className="mt-auto rounded-sm border border-line bg-paper p-2">
            <div className="mono flex justify-between text-[9px] text-ink-faint"><span>credits</span><span className="text-ink">1,240</span></div>
            <div className="mt-1 h-1 rounded-full bg-line"><div className="h-1 w-[62%] rounded-full bg-ink" /></div>
          </div>
          <div className="mono mt-2 px-1 text-[8.5px] text-ink-faint">app-shell · nav-config.ts</div>
        </div>
      </Part>

      {/* topbar */}
      <Part p={p} from={{ y: -140 }} win={[0.14, 0.28]} style={{ left: SB, top: 0, width: W - SB, height: TB }} className="rounded-tr-xl border-b border-line bg-paper">
        <div className="flex h-full items-center gap-3 px-4">
          <span className="text-[12px] font-semibold text-ink">Dashboard</span>
          <span className="mono text-[9px] text-ink-faint">/dashboard</span>
          <span className="ml-auto flex items-center gap-2">
            <Tag tone="amber">Pro · trial 9d</Tag>
            <span className="relative"><Bell className="size-3.5 text-ink-dim" strokeWidth={1.75} /><span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-fail" /></span>
            <span className="flex size-5 items-center justify-center rounded-full bg-ink text-[9px] font-semibold text-paper">M</span>
          </span>
        </div>
      </Part>

      {/* row 1 — identity */}
      <Part p={p} from={{ x: -320, y: -180, r: -7 }} win={[0.24, 0.38]} style={{ left: cx, top: cy, width: col3, height: r1h }}>
        <Tile title="Workspace" icon={Fingerprint} src="auth">
          <Row l="members" r="4 · owner, admin, 2 members" />
          <Row l="invitations" r="1 pending" tone="amber" />
          <Row l="session" r="verified · OAuth" tone="settle" />
        </Tile>
      </Part>

      {/* row 1 — commerce */}
      <Part p={p} from={{ y: -280, r: 4 }} win={[0.32, 0.46]} style={{ left: cx + col3 + gap, top: cy, width: col3, height: r1h }}>
        <Tile title="Plan & credits" icon={CreditCard} src="billing">
          <Row l="plan" r="Pro · $49/mo" />
          <Row l="credits" r="1,240 / 2,000" />
          <Row l="reserved" r="38 (2 runs)" tone="amber" />
        </Tile>
      </Part>

      {/* row 1 — executions */}
      <Part p={p} from={{ x: 320, y: -180, r: 7 }} win={[0.4, 0.54]} style={{ left: cx + (col3 + gap) * 2, top: cy, width: col3, height: r1h }}>
        <Tile title="Executions · today" icon={Activity} src="executions">
          <Row l="chat.message" r="settled · 12 cr" tone="settle" />
          <Row l="doc.summarize" r="settled · 26 cr" tone="settle" />
          <Row l="chat.message" r="refused · quota" tone="fail" />
        </Tile>
      </Part>

      {/* row 2 — chat with the agent slot */}
      <Part p={p} from={{ y: 320, s: 0.92 }} win={[0.48, 0.64]} style={{ left: cx, top: r2y, width: chatW, height: r2h }}>
        <Tile title="Chat" icon={MessageSquare} src="chat · core" className="relative">
          <div className="flex h-full flex-col gap-2">
            <div className="max-w-[78%] self-end rounded-md bg-ink px-2.5 py-1.5 text-[10.5px] text-paper">
              Summarise the Q3 contract and flag renewal risks.
            </div>
            <div className="max-w-[86%] rounded-md border border-line bg-paper-raised px-2.5 py-1.5 text-[10.5px] text-ink">
              Three clauses auto-renew in October. The indemnity cap changed from 12 to 6 months…
              <div className="mono mt-1 flex gap-1 text-[8.5px] text-ink-faint"><Tag tone="settle">settled · 26 credits</Tag><Tag>gpt-5-mini</Tag></div>
            </div>
            <div className="relative mt-auto">
              <motion.div
                style={{
                  opacity: agentGlow,
                  background: "radial-gradient(60% 80% at 50% 50%, color-mix(in oklab, var(--foreground) 10%, transparent), transparent 70%)",
                }}
                className="pointer-events-none absolute -inset-3 rounded-lg"
              />
              <motion.div style={{ opacity: agentIn, scale: agentScale, y: agentY }} className="relative will-change-transform">
                <div className="flex items-center gap-2.5 rounded-md border border-dashed border-amber bg-amber-soft/50 px-3 py-2.5">
                  <span className="flex size-7 items-center justify-center rounded-md bg-ink text-paper"><Bot className="size-4" strokeWidth={1.75} /></span>
                  <span>
                    <span className="block text-[11px] font-semibold text-ink">your agent</span>
                    <span className="mono block text-[8.5px] text-ink-dim">prompts · tools · knowledge — Mastra, AI SDK, anything</span>
                  </span>
                  <span className="mono ml-auto text-[8.5px] text-amber">begin() → yourAgent() → complete()</span>
                </div>
              </motion.div>
            </div>
            <div className="mono flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[9.5px] text-ink-faint">
              Ask anything… <Sparkles className="ml-auto size-3" strokeWidth={1.75} />
            </div>
          </div>
        </Tile>
      </Part>

      {/* row 2 right — operations */}
      <Part p={p} from={{ x: 340, r: -5 }} win={[0.56, 0.7]} style={{ left: rightX, top: r2y, width: rightW, height: opsH }}>
        <Tile title="Operations" icon={Wrench} src="jobs · audit · admin">
          <Row l="jobs" r="3 queued · 0 failed" />
          <Row l="audit" r="execution.settled" tone="settle" />
          <Row l="audit" r="member.role_changed" />
          <Row l="admin" r="impersonation — audited" tone="amber" />
        </Tile>
      </Part>

      {/* row 2 right — documents & notifications */}
      <Part p={p} from={{ x: 340, y: 200 }} win={[0.62, 0.76]} style={{ left: rightX, top: r2y + opsH + gap, width: rightW, height: r2h - opsH - gap }}>
        <Tile title="Artifacts & inbox" icon={FileText} src="artifacts · notifications">
          <Row l="Q3 contract summary" r="v3 · shared" />
          <Row l="Renewal risk memo" r="draft" />
          <Row l="inbox" r="2 unread" tone="amber" />
        </Tile>
      </Part>
    </div>
  );
}

/* ---------- pinned track + rail ---------- */

/**
 * Scroll progress over the track, 0 at its top and 1 when its bottom
 * reaches the bottom of the viewport. Computed by hand rather than with
 * useScroll: Motion promotes useScroll-derived transforms to native
 * ScrollTimeline animations whose range is the element's view timeline,
 * not the track — the parts faded out again as the track left the fold.
 */
function useTrackProgress(ref: React.RefObject<HTMLDivElement | null>) {
  const p = useMotionValue(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      p.set(total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref, p]);
  return p;
}

function useScale(width: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.getBoundingClientRect().width / width));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return { ref, scale };
}

export function Assembly() {
  const reduce = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const p = useTrackProgress(track);
  const [phase, setPhase] = useState(0);
  useMotionValueEvent(p, "change", (v) => {
    let i = 0;
    PHASES.forEach((ph, n) => { if (v >= ph.at) i = n; });
    setPhase(i);
  });
  const { ref, scale } = useScale(W);
  const done = useTransform(p, [0.94, 1], [0, 1]);

  // Reduced motion: the finished application, no pinning.
  if (reduce) {
    return (
      <div ref={track}>
        <div ref={ref} className="overflow-hidden">
          <div style={{ height: H * scale }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
              <StaticStage />
            </div>
          </div>
        </div>
        <Rail active={PHASES.length - 1} className="mt-6" />
      </div>
    );
  }

  return (
    <div ref={track} className="relative" style={{ height: "420vh" }}>
      <div className="sticky top-14 flex min-h-[calc(100vh-3.5rem)] flex-col justify-center py-6">
        <div className="grid gap-6 lg:grid-cols-[240px_1fr] lg:gap-10">
          <div className="order-2 lg:order-1">
            <Rail active={phase} />
            <div className="mt-5 hidden lg:block">
              <div className="mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-faint">now landing</div>
              <div className="mt-1 text-[1.05rem] font-semibold text-ink">{PHASES[phase]!.label}</div>
              <div className="mono mt-0.5 text-[0.72rem] text-amber">{PHASES[phase]!.src}</div>
              <p className="mt-2 text-[0.88rem] text-ink-dim">{PHASES[phase]!.note}</p>
              <motion.p style={{ opacity: done }} className="mono mt-4 text-[0.72rem] text-settle">
                ✓ assembled — every part but one is on npm or in the registry
              </motion.p>
            </div>
          </div>
          <div ref={ref} className="order-1 overflow-hidden lg:order-2">
            <div style={{ height: H * scale }}>
              <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
                <Stage p={p} />
              </div>
            </div>
            <p className="mono mt-3 text-center text-[0.7rem] text-ink-faint lg:hidden">
              <span className="text-ink-dim">{PHASES[phase]!.label}</span> · {PHASES[phase]!.src}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Rail({ active, className }: { active: number; className?: string }) {
  return (
    <ol className={cn("flex flex-wrap gap-1 lg:flex-col lg:gap-0 lg:border-t lg:border-line", className)} aria-label="Parts of the application">
      {PHASES.map((ph, i) => (
        <li
          key={ph.id}
          className={cn(
            "mono flex items-center gap-2 overflow-hidden rounded-sm border border-line px-2 py-1 text-[0.72rem] transition-colors lg:rounded-none lg:border-x-0 lg:border-t-0 lg:border-b lg:px-0 lg:py-2",
            i < active ? "text-ink-dim" : i === active ? "border-amber text-ink lg:border-line" : "text-ink-faint"
          )}
        >
          <span className={cn("inline-block size-1.5 rounded-full", i < active ? "bg-settle" : i === active ? "bg-amber" : "bg-line-strong")} />
          <span className="lg:w-[8rem] lg:shrink-0">{ph.label}</span>
          <span className="hidden min-w-0 truncate text-ink-faint lg:inline">{ph.short}</span>
        </li>
      ))}
    </ol>
  );
}

/** The assembled state, for reduced motion and as the no-JS fallback. */
function StaticStage() {
  const one = useTransform(() => 1);
  return <Stage p={one} />;
}
