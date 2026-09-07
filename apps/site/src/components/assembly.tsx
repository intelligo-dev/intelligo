import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { REGISTRY_ITEMS, type RegistryGroup } from "@/lib/registry-items";

/**
 * The assembly, in three acts on one pinned stage. Scroll progress
 * (0 → 1 over the track) drives everything:
 *
 *   act 1  blocks fly in and compose every page family in the registry
 *   act 2  the pages shrink aside; a terminal creates the app and installs
 *          the packages and the pages
 *   act 3  the parts lock into one running application — shell, identity,
 *          commerce, execution accounting, product surfaces, operations —
 *          and the last slot to land is the agent
 *
 * Every label is a real registry item or package. With reduced motion
 * the finished application renders statically.
 */

const W = 960;
const H = 600;

/** act boundaries on the 0 → 1 track */
const ACT = {
  pagesEnd: 0.4, // last page card has landed
  shelve: [0.42, 0.5] as [number, number], // grid shrinks aside, terminal slides in
  termEnd: 0.66, // last terminal line printed
  clear: [0.67, 0.72] as [number, number], // grid + terminal leave
  app: [0.7, 1] as [number, number], // act 3, remapped to the stage's own 0 → 1
};

type Phase = { id: string; label: string; src: string; short: string; note: string; at: number };

export const PHASES: Phase[] = [
  { id: "pages", label: "Blocks become pages", src: `${REGISTRY_ITEMS.length} page families`, short: "registry", note: "Forms, tables, shells, panels — composed from your own shadcn primitives into every page family in the registry.", at: 0 },
  { id: "install", label: "One command each", src: "@intelligo-dev/* · intelligo.dev/r", short: "npm + registry", note: "create scaffolds the app; the packages install from npm; every page lands as source in your tree.", at: ACT.shelve[0] },
  { id: "app", label: "A SaaS, assembled", src: "auth · billing · executions · core · jobs · audit", short: "one application", note: "Every screen wired to a typed service. Workspaces, credits, executions, audit — running before a model key exists.", at: ACT.clear[0] },
  { id: "agent", label: "Your agent", src: "Mastra · AI SDK · anything", short: "yours", note: "The only slot you write. Native, unmodified, bracketed by the boundary.", at: ACT.app[0] + 0.8 * (ACT.app[1] - ACT.app[0]) },
];

/** deterministic scatter, so SSR and the client agree */
function rnd(i: number, k: number) {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

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

/* ---------- act 1: blocks become pages ---------- */

type Block = { x: number; y: number; w: number; h: number; kind: "bar" | "box" | "input" | "btn" | "text" | "chart" | "bubble" | "side" };

/** wireframe per page family, in % of the card body */
function layoutFor(name: string, group: RegistryGroup): Block[] {
  const form: Block[] = [
    { x: 22, y: 8, w: 56, h: 9, kind: "text" },
    { x: 22, y: 24, w: 56, h: 12, kind: "input" },
    { x: 22, y: 42, w: 56, h: 12, kind: "input" },
    { x: 22, y: 62, w: 56, h: 13, kind: "btn" },
  ];
  const shell: Block[] = [
    { x: 0, y: 0, w: 22, h: 100, kind: "side" },
    { x: 26, y: 8, w: 70, h: 10, kind: "bar" },
    { x: 26, y: 26, w: 21, h: 28, kind: "box" },
    { x: 50, y: 26, w: 21, h: 28, kind: "box" },
    { x: 75, y: 26, w: 21, h: 28, kind: "box" },
    { x: 26, y: 60, w: 70, h: 32, kind: "chart" },
  ];
  const settings: Block[] = [
    { x: 0, y: 0, w: 22, h: 100, kind: "side" },
    { x: 28, y: 8, w: 40, h: 9, kind: "text" },
    { x: 28, y: 26, w: 66, h: 12, kind: "input" },
    { x: 28, y: 44, w: 66, h: 12, kind: "input" },
    { x: 28, y: 64, w: 26, h: 13, kind: "btn" },
  ];
  switch (name) {
    case "pricing":
      return [
        { x: 20, y: 6, w: 60, h: 9, kind: "text" },
        { x: 6, y: 24, w: 27, h: 68, kind: "box" },
        { x: 36, y: 18, w: 28, h: 78, kind: "box" },
        { x: 67, y: 24, w: 27, h: 68, kind: "box" },
      ];
    case "checkout":
      return [
        { x: 6, y: 10, w: 50, h: 12, kind: "input" },
        { x: 6, y: 28, w: 50, h: 12, kind: "input" },
        { x: 6, y: 46, w: 50, h: 12, kind: "input" },
        { x: 6, y: 68, w: 50, h: 14, kind: "btn" },
        { x: 62, y: 10, w: 32, h: 72, kind: "box" },
      ];
    case "usage":
      return [
        { x: 0, y: 0, w: 22, h: 100, kind: "side" },
        { x: 26, y: 8, w: 70, h: 10, kind: "bar" },
        { x: 26, y: 24, w: 70, h: 68, kind: "chart" },
      ];
    case "billing-settings":
    case "team-settings":
      return [
        { x: 0, y: 0, w: 22, h: 100, kind: "side" },
        { x: 28, y: 8, w: 40, h: 9, kind: "text" },
        { x: 28, y: 24, w: 66, h: 12, kind: "bar" },
        { x: 28, y: 40, w: 66, h: 12, kind: "bar" },
        { x: 28, y: 56, w: 66, h: 12, kind: "bar" },
        { x: 28, y: 76, w: 24, h: 13, kind: "btn" },
      ];
    case "chat":
      return [
        { x: 0, y: 0, w: 22, h: 100, kind: "side" },
        { x: 50, y: 10, w: 44, h: 14, kind: "bubble" },
        { x: 26, y: 32, w: 52, h: 22, kind: "box" },
        { x: 26, y: 78, w: 68, h: 14, kind: "input" },
      ];
    case "artifacts":
      return [
        { x: 0, y: 0, w: 22, h: 100, kind: "side" },
        { x: 26, y: 8, w: 30, h: 84, kind: "box" },
        { x: 60, y: 8, w: 36, h: 84, kind: "chart" },
      ];
    case "notifications":
      return [
        { x: 0, y: 0, w: 22, h: 100, kind: "side" },
        { x: 26, y: 8, w: 70, h: 14, kind: "bar" },
        { x: 26, y: 28, w: 70, h: 14, kind: "bar" },
        { x: 26, y: 48, w: 70, h: 14, kind: "bar" },
        { x: 26, y: 68, w: 70, h: 14, kind: "bar" },
      ];
    case "trial-banner":
    case "feature-gating":
    case "language-switcher":
    case "payment-poll":
    case "route-error":
      return [
        { x: 12, y: 30, w: 76, h: 36, kind: "box" },
        { x: 34, y: 74, w: 32, h: 12, kind: "btn" },
      ];
  }
  if (group === "Auth") return form;
  if (group === "Shell") return shell;
  if (group === "Settings") return settings;
  return form;
}

function BlockEl({ kind }: { kind: Block["kind"] }) {
  const base = "absolute inset-0 rounded-[2px]";
  switch (kind) {
    case "side":
      return <div className={cn(base, "rounded-none border-r border-line bg-paper-sunken")} />;
    case "bar":
      return <div className={cn(base, "border border-line bg-paper")} />;
    case "box":
      return <div className={cn(base, "border border-line bg-paper-raised")} />;
    case "input":
      return <div className={cn(base, "border border-line-strong bg-paper")} />;
    case "btn":
      return <div className={cn(base, "bg-ink")} />;
    case "text":
      return <div className={cn(base, "rounded-sm bg-line-strong")} />;
    case "bubble":
      return <div className={cn(base, "rounded-md bg-ink")} />;
    case "chart":
      return (
        <div className={cn(base, "flex items-end gap-[2px] border border-line bg-paper px-1 pb-1")}>
          {[40, 70, 55, 90, 65, 80].map((h, i) => (
            <span key={i} className="flex-1 rounded-t-[1px] bg-ink/70" style={{ height: `${h}%` }} />
          ))}
        </div>
      );
  }
}

function PageCard({ p, i, name, group, x, y, w, h }: { p: MotionValue<number>; i: number; name: string; group: RegistryGroup; x: number; y: number; w: number; h: number }) {
  const n = REGISTRY_ITEMS.length;
  const start = 0.01 + (i / n) * (ACT.pagesEnd - 0.12);
  const win: [number, number] = [start, start + 0.11];
  const blocks = useMemo(() => layoutFor(name, group), [name, group]);
  const frameOp = useTransform(p, [win[0], win[0] + 0.03], [0, 1]);
  const labelOp = useTransform(p, [win[1] - 0.02, win[1]], [0, 1]);
  const bodyH = h - 16;
  return (
    <motion.div style={{ left: x, top: y, width: w, height: h, opacity: frameOp }} className="absolute rounded-md border border-line bg-paper-raised">
      <div className="relative h-full overflow-visible">
        {blocks.map((b, k) => {
          const a = rnd(i, k);
          const ang = a * Math.PI * 2;
          const dist = 220 + rnd(i, k + 7) * 260;
          const sub: [number, number] = [win[0] + k * 0.012, win[0] + 0.07 + k * 0.012];
          return (
            <Part
              key={k}
              p={p}
              from={{
                // integers: Motion prints 4 decimals on the server and the full float on the client
                x: Math.round(Math.cos(ang) * dist),
                y: Math.round(Math.sin(ang) * dist),
                r: Math.round((rnd(i, k + 3) - 0.5) * 60),
                s: 1.3,
              }}
              win={sub}
              style={{
                left: Math.round((b.x / 100) * w),
                top: Math.round(16 + (b.y / 100) * bodyH),
                width: Math.round((b.w / 100) * w),
                height: Math.round((b.h / 100) * bodyH),
              }}
            >
              <BlockEl kind={b.kind} />
            </Part>
          );
        })}
      </div>
      <motion.div style={{ opacity: labelOp }} className="mono absolute inset-x-0 top-0 flex h-4 items-center justify-between border-b border-line px-1.5 text-[7.5px] text-ink-dim">
        <span className="truncate">{name}</span>
        <span className="text-ink-faint">{group.toLowerCase()}</span>
      </motion.div>
    </motion.div>
  );
}

function PagesGrid({ p }: { p: MotionValue<number> }) {
  const cols = 5;
  const gap = 12;
  const pad = 20;
  const w = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols);
  const rows = Math.ceil(REGISTRY_ITEMS.length / cols);
  const h = Math.floor((H - pad * 2 - gap * (rows - 1)) / rows);
  // act 2: the grid shrinks to the left; act 3: it leaves
  const scale = useTransform(p, [ACT.shelve[0], ACT.shelve[1], ACT.clear[0], ACT.clear[1]], [1, 0.42, 0.42, 0.3]);
  const x = useTransform(p, ACT.shelve, [0, -pad]);
  const y = useTransform(p, ACT.shelve, [0, 60]);
  const opacity = useTransform(p, [ACT.clear[0], ACT.clear[1]], [1, 0]);
  return (
    <motion.div style={{ scale, x, y, opacity, transformOrigin: "left center" }} className="absolute inset-0 will-change-transform">
      {REGISTRY_ITEMS.map((it, i) => (
        <PageCard
          key={it.name}
          p={p}
          i={i}
          name={it.name}
          group={it.group}
          x={pad + (i % cols) * (w + gap)}
          y={pad + Math.floor(i / cols) * (h + gap)}
          w={w}
          h={h}
        />
      ))}
    </motion.div>
  );
}

/* ---------- act 2: the terminal ---------- */

const PACKAGES = ["auth", "billing", "billing-core", "executions", "core", "jobs", "audit", "admin"];

type Line = { text: string; tone?: "cmd" | "ok" | "dim" | "amber" };

const LINES: Line[] = [
  { text: "pnpm dlx @intelligo-dev/cli@beta create my-app", tone: "cmd" },
  { text: "✓ my-app/lib/intelligo.ts — composition root", tone: "ok" },
  { text: "✓ my-app/lib/plans.ts · intelligo.manifest.json", tone: "ok" },
  { text: `pnpm add ${PACKAGES.map((x) => `@intelligo-dev/${x}`).join(" ")}`, tone: "cmd" },
  ...PACKAGES.map((x) => ({ text: `+ @intelligo-dev/${x} 1.0.0-beta.3`, tone: "dim" as const })),
  { text: "pnpm exec shadcn add https://intelligo.dev/r/app-shell.json … ×" + REGISTRY_ITEMS.length, tone: "cmd" },
  { text: `✓ ${REGISTRY_ITEMS.length} page families installed as source — app/[locale]/**, components/**, actions/**, messages/en/**`, tone: "ok" },
  { text: "pnpm db:push && pnpm dev", tone: "cmd" },
  { text: "▲ ready on http://localhost:3000", tone: "amber" },
];

function TermLine({ p, i, line }: { p: MotionValue<number>; i: number; line: Line }) {
  const start = ACT.shelve[1] + (i / LINES.length) * (ACT.termEnd - ACT.shelve[1]);
  const opacity = useTransform(p, [start, start + 0.008], [0, 1]);
  return (
    <motion.div
      style={{ opacity }}
      className={cn(
        "whitespace-pre-wrap break-words",
        line.tone === "cmd" && "mt-2 text-ink first:mt-0",
        line.tone === "ok" && "text-settle",
        line.tone === "dim" && "text-ink-dim",
        line.tone === "amber" && "text-amber"
      )}
    >
      {line.tone === "cmd" && <span className="text-ink-faint">$ </span>}
      {line.text}
    </motion.div>
  );
}

function Terminal({ p }: { p: MotionValue<number> }) {
  const x = useTransform(p, ACT.shelve, [360, 0]);
  const opacity = useTransform(p, [ACT.shelve[0], ACT.shelve[1], ACT.clear[0], ACT.clear[1]], [0, 1, 1, 0]);
  const scale = useTransform(p, ACT.clear, [1, 0.9]);
  return (
    <motion.div style={{ x, opacity, scale, left: 430, top: 40, width: 500, height: 520 }} className="absolute flex flex-col overflow-hidden rounded-lg border border-line bg-paper-sunken shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)] will-change-transform">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-line px-3">
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="mono ml-2 text-[10px] text-ink-faint">my-app — zsh</span>
      </div>
      <div className="mono flex-1 space-y-0.5 overflow-hidden p-4 text-[11px] leading-[1.55]">
        {LINES.map((l, i) => (
          <TermLine key={i} p={p} i={i} line={l} />
        ))}
      </div>
    </motion.div>
  );
}

/* ---------- act 3 wrapper: the application ---------- */

function App({ p }: { p: MotionValue<number> }) {
  const local = useTransform(p, ACT.app, [0, 1]);
  const opacity = useTransform(p, [ACT.app[0], ACT.app[0] + 0.04], [0, 1]);
  return (
    <motion.div style={{ opacity }} className="absolute inset-0">
      <Stage p={local} />
    </motion.div>
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
    PHASES.forEach((ph, n) => {
      if (v >= ph.at) i = n;
    });
    setPhase(i);
  });
  const { ref, scale } = useScale(W);
  const done = useTransform(p, [0.96, 1], [0, 1]);
  const pct = useTransform(p, (v) => `${Math.round(v * 100)}%`);

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
    <div ref={track} className="relative" style={{ height: "560vh" }}>
      <div className="sticky top-14 flex min-h-[calc(100vh-3.5rem)] flex-col justify-center py-6">
        <div className="grid gap-6 lg:grid-cols-[240px_1fr] lg:gap-10">
          <div className="order-2 lg:order-1">
            <Rail active={phase} />
            <div className="mt-5 hidden lg:block">
              <div className="mono flex items-center justify-between text-[0.68rem] uppercase tracking-[0.08em] text-ink-faint">
                <span>act {Math.min(phase + 1, 3)} of 3</span>
                <motion.span className="tabular-nums">{pct}</motion.span>
              </div>
              <div className="mt-1 text-[1.05rem] font-semibold text-ink">{PHASES[phase]!.label}</div>
              <div className="mono mt-0.5 text-[0.72rem] text-amber">{PHASES[phase]!.src}</div>
              <p className="mt-2 text-[0.88rem] text-ink-dim">{PHASES[phase]!.note}</p>
              <motion.p style={{ opacity: done }} className="mono mt-4 text-[0.72rem] text-settle">
                ✓ a running SaaS — every part but one is on npm or in the registry
              </motion.p>
            </div>
          </div>
          <div ref={ref} className="order-1 overflow-hidden lg:order-2">
            <div style={{ height: H * scale }}>
              <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
                <div className="relative overflow-hidden rounded-xl" style={{ width: W, height: H }}>
                  <PagesGrid p={p} />
                  <Terminal p={p} />
                  <App p={p} />
                </div>
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
    <ol className={cn("flex flex-wrap gap-1 lg:flex-col lg:gap-0 lg:border-t lg:border-line", className)} aria-label="The three acts">
      {PHASES.map((ph, i) => (
        <li
          key={ph.id}
          className={cn(
            "mono flex items-center gap-2 overflow-hidden rounded-sm border border-line px-2 py-1 text-[0.72rem] transition-colors lg:rounded-none lg:border-x-0 lg:border-t-0 lg:border-b lg:px-0 lg:py-2.5",
            i < active ? "text-ink-dim" : i === active ? "border-amber text-ink lg:border-line" : "text-ink-faint"
          )}
        >
          <span className={cn("inline-block size-1.5 rounded-full", i < active ? "bg-settle" : i === active ? "bg-amber" : "bg-line-strong")} />
          <span className="lg:w-[9.5rem] lg:shrink-0">{ph.label}</span>
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
