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
import { PACKAGES as PACKAGE_MAP } from "@/lib/packages";
import { SITE } from "@/lib/site";

/**
 * The film: one pinned stage, four scenes, one continuous state. Scroll
 * progress (0 → 1 over the track) drives everything:
 *
 *   01 the build   pages are created group by group, the packages
 *                  install, the parts lock into one running application
 *   02 the run     a message is admitted, answered by the agent, settled
 *   03 make it yours   the chat page opens as source; one config line
 *                  changes and the running app follows
 *   04 time passes a new release: migrations, doctor, customised files kept
 *
 * The application frame persists across scenes 1–4, so every scene
 * inherits the previous one's state. Every label is a real registry item
 * or package. With reduced motion the finished application renders
 * statically.
 */

const W = 960;
const H = 600;

/** act boundaries on the 0 → 1 track */
const ACT = {
  moments: [0.02, 0.44] as [number, number], // act 1: four moments, one thing on screen at a time
  shelve: [0.44, 0.5] as [number, number], // terminal slides in over the tray
  termEnd: 0.66, // last terminal line printed
  clear: [0.67, 0.72] as [number, number], // tray + terminal leave
  app: [0.7, 1] as [number, number], // act 3, remapped to the stage's own 0 → 1
};

/** act 1, one moment per group of pages — in the order a user meets them */
type Moment = {
  id: string;
  title: string;
  sub: string;
  /** registry items that land in this moment */
  items: string[];
  /** "page": one large page assembles; "grid": every item as a small card */
  kind: "page" | "grid";
  /** the page family whose wireframe the large card shows */
  page: string;
};

const by = (group: RegistryGroup) =>
  REGISTRY_ITEMS.filter((i) => i.group === group).map((i) => i.name);

const MOMENTS: Moment[] = [
  {
    id: "auth",
    title: "Auth",
    sub: "sign-up · verify · login · reset · onboarding · invitations",
    items: by("Auth"),
    kind: "page",
    page: "auth-login",
  },
  {
    id: "dashboard",
    title: "Dashboard",
    sub: "app-shell · dashboard · notifications · banners · errors",
    items: by("Shell"),
    kind: "page",
    page: "dashboard",
  },
  {
    id: "chat",
    title: "Chat & artifacts",
    sub: "conversations · documents — persisted by core",
    items: by("AI"),
    kind: "page",
    page: "chat",
  },
  {
    id: "rest",
    title: "Settings & billing",
    sub: "workspace · team · profile · privacy · pricing · checkout · usage",
    items: [...by("Settings"), ...by("Commerce")],
    kind: "grid",
    page: "team-settings",
  },
];

function momentWindow(k: number): [number, number] {
  const [a, b] = ACT.moments;
  const len = (b - a) / MOMENTS.length;
  return [a + k * len, a + (k + 1) * len];
}

/* ---------- the film: four scenes on one track ---------- */

/** scene windows on the 0 → 1 track */
const SCENE = {
  build: [0, 0.4] as [number, number],
  run: [0.4, 0.6] as [number, number],
  yours: [0.6, 0.8] as [number, number],
  time: [0.8, 1] as [number, number],
};

export const SCENES = [
  {
    id: "build",
    n: "01",
    title: "The build",
    note: "Pages are created group by group, the packages install, and the parts lock into one running application.",
  },
  {
    id: "run",
    n: "02",
    title: "The run",
    note: "A message goes in. Intelligo admits it, your agent answers natively, the run settles — credits, usage and audit move in the same frame.",
  },
  {
    id: "yours",
    n: "03",
    title: "Make it yours",
    note: "The chat page is your source. Change one line of config and the running app follows; the components stay untouched.",
  },
  {
    id: "time",
    n: "04",
    title: "Time passes",
    note: "A new release lands. Migrations ship with it, the doctor sees what you customised and keeps it. Still yours.",
  },
] as const;

type Step = { scene: number; label: string; at: number };
const g = (win: [number, number], f: number) => win[0] + f * (win[1] - win[0]);

const STEPS: Step[] = [
  ...MOMENTS.map((m, k) => ({
    scene: 0,
    label: `${m.title} created`,
    at: g(SCENE.build, momentWindow(k)[0]),
  })),
  { scene: 0, label: "Packages installed", at: g(SCENE.build, ACT.shelve[0]) },
  { scene: 0, label: "SaaS ready", at: g(SCENE.build, ACT.clear[0]) },
  {
    scene: 0,
    label: "Your agent lands",
    at: g(SCENE.build, ACT.app[0] + 0.8 * (ACT.app[1] - ACT.app[0])),
  },
  { scene: 1, label: "A message is typed", at: g(SCENE.run, 0) },
  {
    scene: 1,
    label: "Admit — entitlement checked, credits reserved",
    at: g(SCENE.run, 0.2),
  },
  { scene: 1, label: "Run — your agent, unmodified", at: g(SCENE.run, 0.42) },
  {
    scene: 1,
    label: "Settle — usage recorded, credits charged",
    at: g(SCENE.run, 0.68),
  },
  { scene: 2, label: "Open the installed page", at: g(SCENE.yours, 0) },
  { scene: 2, label: "Edit lib/chat-config.tsx", at: g(SCENE.yours, 0.25) },
  {
    scene: 2,
    label: "Hot reload — components untouched",
    at: g(SCENE.yours, 0.62),
  },
  { scene: 3, label: "intelligo upgrade --check", at: g(SCENE.time, 0.12) },
  { scene: 3, label: "Customised files kept", at: g(SCENE.time, 0.5) },
  { scene: 3, label: "Still yours", at: g(SCENE.time, 0.85) },
];

/** The published version, from proof.json — never typed here. */
const PACKAGE_VERSION = SITE.version;
/** The release that "lands" in scene 04: the next prerelease (or patch). */
const NEXT_VERSION = bumpVersion(PACKAGE_VERSION);

function bumpVersion(v: string): string {
  const pre = v.match(/^(.*-[a-z]+\.)(\d+)$/i);
  if (pre) return `${pre[1]}${Number(pre[2]) + 1}`;
  const rel = v.match(/^(\d+\.\d+\.)(\d+)$/);
  return rel ? `${rel[1]}${Number(rel[2]) + 1}` : v;
}

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
  const opacity = useTransform(
    p,
    [win[0], win[0] + (win[1] - win[0]) * 0.6],
    [0, 1]
  );
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

function Tag({
  children,
  tone = "faint",
}: {
  children: ReactNode;
  tone?: "faint" | "amber" | "settle";
}) {
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
  title: ReactNode;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  src: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-md border border-line bg-paper shadow-[0_12px_30px_-18px_rgba(0,0,0,0.35)]",
        className
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-line px-2.5 py-1.5">
        <Icon className="size-3 text-ink-dim" strokeWidth={1.75} />
        <span className="text-[11px] font-semibold text-ink">{title}</span>
        <span className="mono ml-auto text-[8.5px] text-ink-faint">{src}</span>
      </div>
      <div className="min-h-0 flex-1 p-2.5">{children}</div>
    </div>
  );
}

function Row({
  l,
  r,
  tone,
}: {
  l: string;
  r: string;
  tone?: "settle" | "fail" | "amber";
}) {
  return (
    <div className="mono flex items-center justify-between border-t border-line py-[3px] text-[9.5px] first:border-t-0">
      <span className="text-ink-dim">{l}</span>
      <span
        className={cn(
          "text-ink",
          tone === "settle" && "text-settle",
          tone === "fail" && "text-fail",
          tone === "amber" && "text-amber"
        )}
      >
        {r}
      </span>
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

/* ---------- act 1: blocks become pages ---------- */

type Block = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "bar" | "box" | "input" | "btn" | "text" | "chart" | "bubble" | "side";
};

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
      return (
        <div
          className={cn(
            base,
            "rounded-none border-r border-line bg-paper-sunken"
          )}
        />
      );
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
        <div
          className={cn(
            base,
            "flex items-end gap-[2px] border border-line bg-paper px-1 pb-1"
          )}
        >
          {[40, 70, 55, 90, 65, 80].map((h, i) => (
            <span
              key={i}
              className="flex-1 rounded-t-[1px] bg-ink/70"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      );
  }
}

/** blocks flying into a wireframe; `local` runs 0 → 1 while the card assembles */
function Wireframe({
  local,
  seed,
  name,
  group,
  w,
  h,
  label,
}: {
  local: MotionValue<number>;
  seed: number;
  name: string;
  group: RegistryGroup;
  w: number;
  h: number;
  label?: boolean;
}) {
  const blocks = useMemo(() => layoutFor(name, group), [name, group]);
  const bodyH = h - (label ? 18 : 0);
  const frameOp = useTransform(local, [0, 0.15], [0, 1]);
  const labelOp = useTransform(local, [0.8, 1], [0, 1]);
  return (
    <motion.div
      style={{ width: w, height: h, opacity: frameOp }}
      className="relative rounded-md border border-line bg-paper-raised"
    >
      {blocks.map((b, k) => {
        const ang = rnd(seed, k) * Math.PI * 2;
        const dist = 260 + rnd(seed, k + 7) * 300;
        const n = blocks.length;
        const sub: [number, number] = [(k / n) * 0.45, (k / n) * 0.45 + 0.5];
        return (
          <Part
            key={k}
            p={local}
            from={{
              x: Math.round(Math.cos(ang) * dist),
              y: Math.round(Math.sin(ang) * dist),
              r: Math.round((rnd(seed, k + 3) - 0.5) * 50),
              s: 1.25,
            }}
            win={sub}
            style={{
              left: Math.round((b.x / 100) * w),
              top: Math.round((label ? 18 : 0) + (b.y / 100) * bodyH),
              width: Math.round((b.w / 100) * w),
              height: Math.round((b.h / 100) * bodyH),
            }}
          >
            <BlockEl kind={b.kind} />
          </Part>
        );
      })}
      {label && (
        <motion.div
          style={{ opacity: labelOp }}
          className="mono absolute inset-x-0 top-0 flex h-[18px] items-center justify-between border-b border-line px-2 text-[8.5px] text-ink-dim"
        >
          <span className="truncate">{name}</span>
          <span className="text-ink-faint">{group.toLowerCase()}</span>
        </motion.div>
      )}
    </motion.div>
  );
}

/* the large card's box and the tray it shrinks into */
const HERO = { x: 220, y: 74, w: 520, h: 320 };
const TRAY = { y: 462, w: 196, h: 121, gap: 30 };
const trayX = (k: number) =>
  (W - MOMENTS.length * TRAY.w - (MOMENTS.length - 1) * TRAY.gap) / 2 +
  k * (TRAY.w + TRAY.gap);

function MomentView({
  p,
  k,
  m,
}: {
  p: MotionValue<number>;
  k: number;
  m: Moment;
}) {
  const [a, b] = momentWindow(k);
  const len = b - a;
  const build: [number, number] = [a, a + len * 0.62]; // blocks assemble
  const park: [number, number] = [a + len * 0.78, b]; // card shrinks into the tray
  const local = useTransform(p, build, [0, 1]);

  const sc = TRAY.w / HERO.w;
  const scale = useTransform(p, park, [1, sc]);
  const x = useTransform(p, park, [HERO.x, trayX(k)]);
  const y = useTransform(p, park, [HERO.y, TRAY.y]);
  // in act 2 the tray dims; act 3 it leaves
  const opacity = useTransform(
    p,
    [a, a + 0.005, ACT.shelve[0], ACT.shelve[1], ACT.clear[0], ACT.clear[1]],
    [0, 1, 1, 0.55, 0.55, 0]
  );

  const headOp = useTransform(
    p,
    [a + len * 0.05, a + len * 0.18, park[0], park[0] + len * 0.1],
    [0, 1, 1, 0]
  );
  const headY = useTransform(p, [a + len * 0.05, a + len * 0.18], [12, 0]);
  const checkOp = useTransform(p, [build[1], build[1] + len * 0.08], [0, 1]);
  const chipOp = useTransform(
    p,
    [park[1] - len * 0.05, park[1], ACT.clear[0], ACT.clear[1]],
    [0, 1, 1, 0]
  );

  const cols = 4;
  const gap = 10;
  const cw = Math.floor((HERO.w - gap * (cols - 1)) / cols);
  const rows = Math.ceil(m.items.length / cols);
  const ch = Math.floor((HERO.h - gap * (rows - 1)) / rows);

  return (
    <>
      {/* headline: the one thing on screen */}
      <motion.div
        style={{ opacity: headOp, y: headY }}
        className="absolute inset-x-0 top-5 flex flex-col items-center text-center"
      >
        <div className="heading flex items-center gap-2 text-[26px] font-semibold leading-none text-ink">
          {m.title}
          <motion.span
            style={{ opacity: checkOp }}
            className="mono rounded-full border border-settle/40 px-2 py-0.5 text-[11px] font-medium text-settle"
          >
            ✓ created · {m.items.length}{" "}
            {m.items.length === 1 ? "page" : "pages"}
          </motion.span>
        </div>
        <div className="mono mt-1.5 text-[11px] text-ink-faint">{m.sub}</div>
      </motion.div>

      {/* the card */}
      <motion.div
        style={{ x, y, scale, opacity, transformOrigin: "top left" }}
        className="absolute left-0 top-0 will-change-transform"
      >
        {m.kind === "page" ? (
          <Wireframe
            local={local}
            seed={k * 10}
            name={m.page}
            group={
              REGISTRY_ITEMS.find((i) => i.name === m.page)?.group ?? "Auth"
            }
            w={HERO.w}
            h={HERO.h}
            label
          />
        ) : (
          <div className="relative" style={{ width: HERO.w, height: HERO.h }}>
            {m.items.map((name, i) => {
              const it = REGISTRY_ITEMS.find((r) => r.name === name)!;
              return (
                <div
                  key={name}
                  className="absolute"
                  style={{
                    left: (i % cols) * (cw + gap),
                    top: Math.floor(i / cols) * (ch + gap),
                  }}
                >
                  <GridCard
                    local={local}
                    i={i}
                    n={m.items.length}
                    name={name}
                    group={it.group}
                    w={cw}
                    h={ch}
                  />
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* tray chip */}
      <motion.div
        style={{
          opacity: chipOp,
          left: trayX(k),
          top: TRAY.y + TRAY.h + 6,
          width: TRAY.w,
        }}
        className="mono absolute flex items-center justify-between text-[10px]"
      >
        <span className="text-ink">{m.title}</span>
        <span className="text-settle">✓ {m.items.length}</span>
      </motion.div>
    </>
  );
}

/** one small card inside the grid moment, staggered by index */
function GridCard({
  local,
  i,
  n,
  name,
  group,
  w,
  h,
}: {
  local: MotionValue<number>;
  i: number;
  n: number;
  name: string;
  group: RegistryGroup;
  w: number;
  h: number;
}) {
  const mine = useTransform(
    local,
    [(i / n) * 0.6, (i / n) * 0.6 + 0.4],
    [0, 1]
  );
  return (
    <Wireframe
      local={mine}
      seed={100 + i}
      name={name}
      group={group}
      w={w}
      h={h}
      label
    />
  );
}

function Moments({ p }: { p: MotionValue<number> }) {
  return (
    <div className="absolute inset-0">
      {MOMENTS.map((m, k) => (
        <MomentView key={m.id} p={p} k={k} m={m} />
      ))}
    </div>
  );
}

/* ---------- act 2: the terminal ---------- */

/** What `pnpm add` installs: the framework layer of the package map. */
const PACKAGES = PACKAGE_MAP.filter(
  (p) => p.layer === "intelligo" && !["cli", "mastra"].includes(p.id)
).map((p) => p.id);

type Line = { text: string; tone?: "cmd" | "ok" | "dim" | "amber" };

const LINES: Line[] = [
  { text: "pnpm dlx @intelligo-dev/cli@beta create my-app", tone: "cmd" },
  { text: "✓ my-app/lib/intelligo.ts — composition root", tone: "ok" },
  { text: "✓ my-app/lib/plans.ts · intelligo.manifest.json", tone: "ok" },
  {
    text: `pnpm add ${PACKAGES.map((x) => `@intelligo-dev/${x}`).join(" ")}`,
    tone: "cmd",
  },
  ...PACKAGES.map((x) => ({
    text: `+ @intelligo-dev/${x} ${PACKAGE_VERSION}`,
    tone: "dim" as const,
  })),
  {
    text:
      "pnpm exec shadcn add https://intelligo.dev/r/app-shell.json … ×" +
      REGISTRY_ITEMS.length,
    tone: "cmd",
  },
  {
    text: `✓ ${REGISTRY_ITEMS.length} page families installed as source — app/[locale]/**, components/**, actions/**, messages/en/**`,
    tone: "ok",
  },
  { text: "pnpm db:push && pnpm dev", tone: "cmd" },
  { text: "▲ ready on http://localhost:3000", tone: "amber" },
];

function TermLine({
  p,
  i,
  line,
}: {
  p: MotionValue<number>;
  i: number;
  line: Line;
}) {
  const start =
    ACT.shelve[1] + (i / LINES.length) * (ACT.termEnd - ACT.shelve[1]);
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
  const y = useTransform(p, ACT.shelve, [-60, 0]);
  const opacity = useTransform(
    p,
    [ACT.shelve[0], ACT.shelve[1], ACT.clear[0], ACT.clear[1]],
    [0, 1, 1, 0]
  );
  const scale = useTransform(p, ACT.clear, [1, 0.9]);
  return (
    <motion.div
      style={{ y, opacity, scale, left: 200, top: 22, width: 560, height: 420 }}
      className="absolute flex flex-col overflow-hidden rounded-lg border border-line bg-paper-sunken shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)] will-change-transform"
    >
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-line px-3">
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="mono ml-2 text-[10px] text-ink-faint">
          my-app — zsh
        </span>
      </div>
      <div className="mono flex-1 space-y-0.5 overflow-hidden p-4 text-[11px] leading-[1.55]">
        {LINES.map((l, i) => (
          <TermLine key={i} p={p} i={i} line={l} />
        ))}
      </div>
    </motion.div>
  );
}

/* ---------- the application (scene 1 builds it; 2–4 change it) ---------- */

/** stage geometry, shared with the overlays */
const G = (() => {
  const SB = 176,
    TB = 44,
    PAD = 18,
    gap = 12;
  const cx = SB + PAD,
    cy = TB + PAD,
    cw = W - cx - PAD;
  const col3 = (cw - gap * 2) / 3,
    r1h = 118;
  const r2y = cy + r1h + gap,
    r2h = H - r2y - PAD;
  const chatW = Math.round(cw * 0.62);
  const rightX = cx + chatW + gap,
    rightW = cw - chatW - gap;
  const opsH = Math.round((r2h - gap) * 0.52);
  return {
    SB,
    TB,
    PAD,
    gap,
    cx,
    cy,
    cw,
    col3,
    r1h,
    r2y,
    r2h,
    chatW,
    rightX,
    rightW,
    opsH,
  };
})();

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));

/** `text` typed out while `mv` runs a → b */
function useTyped(mv: MotionValue<number>, a: number, b: number, text: string) {
  return useTransform(mv, (v) =>
    text.slice(0, Math.round(seg(v, a, b) * text.length))
  );
}

function MRow({
  l,
  r,
  color,
  opacity,
}: {
  l: string;
  r: MotionValue<string>;
  color?: MotionValue<string>;
  opacity?: MotionValue<number>;
}) {
  return (
    <motion.div
      style={{ opacity }}
      className="mono flex items-center justify-between border-t border-line py-[3px] text-[9.5px] first:border-t-0"
    >
      <span className="text-ink-dim">{l}</span>
      <motion.span style={{ color }}>{r}</motion.span>
    </motion.div>
  );
}

type Live = {
  p: MotionValue<number>;
  run: MotionValue<number>;
  yours: MotionValue<number>;
  time: MotionValue<number>;
};

const ASK = "Which clauses expose us at renewal?";
const ANSWER =
  "Two: the auto-renewal in §4.2 (90-day notice, already inside the window) and the price-escalator in §7 with no cap. Recommend serving notice this week.";

function Stage({ p, run, yours, time }: Live) {
  const {
    SB,
    TB,
    cx,
    cy,
    col3,
    r1h,
    r2y,
    r2h,
    chatW,
    rightX,
    rightW,
    opsH,
    gap,
  } = G;

  const agentGlow = useTransform(p, [0.8, 0.94], [0, 1]);
  const agentIn = useTransform(p, [0.8, 0.88], [0, 1]);
  const agentScale = useTransform(p, [0.8, 0.94], [0.8, 1]);
  const agentY = useTransform(p, [0.8, 0.94], [30, 0]);

  // scene 2 — the run
  const typed = useTyped(run, 0.02, 0.14, ASK);
  const caret = useTransform(run, (v) => (v > 0.02 && v < 0.18 ? 1 : 0));
  const askOp = useTransform(run, [0.16, 0.2], [0, 1]);
  const answer = useTyped(run, 0.44, 0.66, ANSWER);
  const answerOp = useTransform(run, [0.42, 0.45], [0, 1]);
  const runTag = useTransform<number, string>(run, (v) =>
    v < 0.7 ? "streaming · 14 reserved" : "settled · 14 credits"
  );
  const runTagColor = useTransform<number, string>(run, (v) =>
    v < 0.7 ? "var(--amber)" : "var(--settle)"
  );
  const credits = useTransform<number, string>(run, (v) =>
    v < 0.72 ? "1,240" : "1,226"
  );
  const creditsRow = useTransform<number, string>(run, (v) =>
    v < 0.72 ? "1,240 / 2,000" : "1,226 / 2,000"
  );
  const reserved = useTransform<number, string>(run, (v) =>
    v < 0.22 ? "38 (2 runs)" : v < 0.72 ? "52 (3 runs)" : "38 (2 runs)"
  );
  const reservedColor = useTransform<number, string>(run, (v) =>
    v >= 0.22 && v < 0.72 ? "var(--amber)" : "var(--ink)"
  );
  const newRun = useTransform<number, string>(run, (v) =>
    v < 0.7 ? "admitted · 14 cr held" : "settled · 14 cr"
  );
  const newRunColor = useTransform<number, string>(run, (v) =>
    v < 0.7 ? "var(--amber)" : "var(--settle)"
  );
  const newRunOp = useTransform(run, [0.22, 0.26], [0, 1]);
  const auditNew = useTransform(run, [0.72, 0.76], [0, 1]);
  const oldAnswerH = useTransform(run, [0.14, 0.2], [1, 0]);

  // scene 3 — make it yours
  const chatTitle = useTransform<number, string>(yours, (v) =>
    v < 0.5 ? "Chat" : "Contract Copilot"
  );
  const placeholder = useTransform<number, string>(yours, (v) =>
    v < 0.56 ? "Ask anything…" : "Ask about any clause…"
  );
  const toastOp = useTransform(yours, [0.62, 0.66, 0.9, 0.95], [0, 1, 1, 0]);

  // scene 4 — time passes
  const version = useTransform<number, string>(time, (v) =>
    v < 0.7 ? PACKAGE_VERSION : NEXT_VERSION
  );
  const versionColor = useTransform<number, string>(time, (v) =>
    v >= 0.7 && v < 0.9 ? "var(--settle)" : "var(--ink-faint)"
  );

  return (
    <div className="relative" style={{ width: W, height: H }}>
      {/* frame */}
      <Part
        p={p}
        from={{ s: 0.96 }}
        win={[0, 0.1]}
        style={{ inset: 0 }}
        className="rounded-xl border border-line-strong bg-paper-raised"
      >
        <span />
      </Part>

      {/* sidebar */}
      <Part
        p={p}
        from={{ x: -260 }}
        win={[0.06, 0.2]}
        style={{ left: 0, top: 0, width: SB, height: H }}
        className="rounded-l-xl border-r border-line bg-paper-sunken/60"
      >
        <div className="flex h-full flex-col p-3">
          <div className="flex items-center gap-2 px-1">
            <span className="inline-block size-3 rounded-[3px] bg-ink" />
            <span className="heading text-[13px] font-semibold text-ink">
              acme
            </span>
          </div>
          <div className="mono mt-3 flex items-center justify-between rounded-sm border border-line bg-paper px-2 py-1.5 text-[10px] text-ink">
            Acme Inc <span className="text-ink-faint">▾</span>
          </div>
          <ul className="mt-3 space-y-0.5">
            {NAV.map(([l, I], i) => (
              <li
                key={l}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-2 py-1.5 text-[11px]",
                  i === 0 ? "bg-paper text-ink" : "text-ink-dim"
                )}
              >
                <I className="size-3" strokeWidth={1.75} /> {l}
              </li>
            ))}
          </ul>
          <div className="mt-auto rounded-sm border border-line bg-paper p-2">
            <div className="mono flex justify-between text-[9px] text-ink-faint">
              <span>credits</span>
              <motion.span className="text-ink">{credits}</motion.span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-line">
              <div className="h-1 w-[62%] rounded-full bg-ink" />
            </div>
          </div>
          <div className="mono mt-2 flex items-center justify-between px-1 text-[8.5px] text-ink-faint">
            <span>@intelligo-dev/*</span>
            <motion.span style={{ color: versionColor }}>{version}</motion.span>
          </div>
        </div>
      </Part>

      {/* topbar */}
      <Part
        p={p}
        from={{ y: -140 }}
        win={[0.14, 0.28]}
        style={{ left: SB, top: 0, width: W - SB, height: TB }}
        className="rounded-tr-xl border-b border-line bg-paper"
      >
        <div className="flex h-full items-center gap-3 px-4">
          <span className="text-[12px] font-semibold text-ink">Dashboard</span>
          <span className="mono text-[9px] text-ink-faint">/dashboard</span>
          <span className="ml-auto flex items-center gap-2">
            <Tag tone="amber">Pro · trial 9d</Tag>
            <span className="relative">
              <Bell className="size-3.5 text-ink-dim" strokeWidth={1.75} />
              <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-fail" />
            </span>
            <span className="flex size-5 items-center justify-center rounded-full bg-ink text-[9px] font-semibold text-paper">
              M
            </span>
          </span>
        </div>
      </Part>

      {/* row 1 — identity */}
      <Part
        p={p}
        from={{ x: -320, y: -180, r: -7 }}
        win={[0.24, 0.38]}
        style={{ left: cx, top: cy, width: col3, height: r1h }}
      >
        <Tile title="Workspace" icon={Fingerprint} src="auth">
          <Row l="members" r="4 · owner, admin, 2 members" />
          <Row l="invitations" r="1 pending" tone="amber" />
          <Row l="session" r="verified · OAuth" tone="settle" />
        </Tile>
      </Part>

      {/* row 1 — commerce */}
      <Part
        p={p}
        from={{ y: -280, r: 4 }}
        win={[0.32, 0.46]}
        style={{ left: cx + col3 + gap, top: cy, width: col3, height: r1h }}
      >
        <Tile title="Plan & credits" icon={CreditCard} src="billing">
          <Row l="plan" r="Pro · $49/mo" />
          <MRow l="credits" r={creditsRow} />
          <MRow l="reserved" r={reserved} color={reservedColor} />
        </Tile>
      </Part>

      {/* row 1 — executions */}
      <Part
        p={p}
        from={{ x: 320, y: -180, r: 7 }}
        win={[0.4, 0.54]}
        style={{
          left: cx + (col3 + gap) * 2,
          top: cy,
          width: col3,
          height: r1h,
        }}
      >
        <Tile title="Executions · today" icon={Activity} src="executions">
          <MRow
            l="chat.message"
            r={newRun}
            color={newRunColor}
            opacity={newRunOp}
          />
          <Row l="chat.message" r="settled · 12 cr" tone="settle" />
          <Row l="doc.summarize" r="settled · 26 cr" tone="settle" />
        </Tile>
      </Part>

      {/* row 2 — chat with the agent slot */}
      <Part
        p={p}
        from={{ y: 320, s: 0.92 }}
        win={[0.48, 0.64]}
        style={{ left: cx, top: r2y, width: chatW, height: r2h }}
      >
        <Tile
          title={<motion.span>{chatTitle}</motion.span>}
          icon={MessageSquare}
          src="chat · core"
          className="relative"
        >
          <div className="flex h-full flex-col gap-1.5 overflow-hidden">
            <div className="max-w-[78%] self-end rounded-md bg-ink px-2.5 py-1.5 text-[10px] text-paper">
              Summarise the Q3 contract and flag renewal risks.
            </div>
            <motion.div
              style={{
                scaleY: oldAnswerH,
                opacity: oldAnswerH,
                transformOrigin: "top",
              }}
              className="max-w-[86%] rounded-md border border-line bg-paper-raised px-2.5 py-1.5 text-[10px] text-ink"
            >
              Three clauses auto-renew in October…
              <div className="mono mt-1 flex gap-1 text-[8.5px] text-ink-faint">
                <Tag tone="settle">settled · 26 credits</Tag>
                <Tag>gpt-5-mini</Tag>
              </div>
            </motion.div>
            <motion.div
              style={{ opacity: askOp }}
              className="max-w-[78%] self-end rounded-md bg-ink px-2.5 py-1.5 text-[10px] text-paper"
            >
              {ASK}
            </motion.div>
            <motion.div
              style={{ opacity: answerOp }}
              className="max-w-[92%] rounded-md border border-line bg-paper-raised px-2.5 py-1.5 text-[10px] text-ink"
            >
              <motion.span>{answer}</motion.span>
              <div className="mono mt-1 flex gap-1 text-[8.5px] text-ink-faint">
                <motion.span
                  style={{ color: runTagColor, borderColor: runTagColor }}
                  className="inline-block rounded-sm border px-1.5 py-px text-[9px] leading-tight"
                >
                  {runTag}
                </motion.span>
                <Tag>gpt-5-mini</Tag>
              </div>
            </motion.div>
            <div className="relative mt-auto">
              <motion.div
                style={{
                  opacity: agentGlow,
                  background:
                    "radial-gradient(60% 80% at 50% 50%, color-mix(in oklab, var(--foreground) 10%, transparent), transparent 70%)",
                }}
                className="pointer-events-none absolute -inset-3 rounded-lg"
              />
              <motion.div
                style={{ opacity: agentIn, scale: agentScale, y: agentY }}
                className="relative will-change-transform"
              >
                <div className="flex items-center gap-2.5 rounded-md border border-dashed border-amber bg-amber-soft/50 px-3 py-2">
                  <span className="flex size-6 items-center justify-center rounded-md bg-ink text-paper">
                    <Bot className="size-3.5" strokeWidth={1.75} />
                  </span>
                  <span>
                    <span className="block text-[10.5px] font-semibold text-ink">
                      your agent
                    </span>
                    <span className="mono block text-[8px] text-ink-dim">
                      prompts · tools · knowledge — Mastra, AI SDK, anything
                    </span>
                  </span>
                  <span className="mono ml-auto text-[8px] text-amber">
                    begin() → yourAgent() → complete()
                  </span>
                </div>
              </motion.div>
            </div>
            <div className="mono relative flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[9.5px] text-ink-faint">
              <motion.span className="text-ink">{typed}</motion.span>
              <motion.span
                style={{ opacity: caret }}
                className="-ml-1 inline-block h-[1em] w-px bg-ink"
              />
              <motion.span
                style={{
                  opacity: useTransform(run, (v) => (v > 0.02 ? 0 : 1)),
                }}
                className="absolute left-2.5"
              >
                {placeholder}
              </motion.span>
              <Sparkles className="ml-auto size-3" strokeWidth={1.75} />
            </div>
          </div>
        </Tile>
        {/* scene 3: hot-reload toast */}
        <motion.div
          style={{ opacity: toastOp }}
          className="mono absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full border border-settle/40 bg-paper px-2.5 py-1 text-[9px] text-settle shadow-sm"
        >
          ✓ lib/chat-config.tsx saved · hot reload · 0 components touched
        </motion.div>
      </Part>

      {/* row 2 right — operations */}
      <Part
        p={p}
        from={{ x: 340, r: -5 }}
        win={[0.56, 0.7]}
        style={{ left: rightX, top: r2y, width: rightW, height: opsH }}
      >
        <Tile title="Operations" icon={Wrench} src="jobs · audit · admin">
          <MRow
            l="audit"
            r={useTransform(() => "execution.settled · 14 cr")}
            color={useTransform(() => "var(--settle)")}
            opacity={auditNew}
          />
          <Row l="jobs" r="3 queued · 0 failed" />
          <Row l="audit" r="member.role_changed" />
          <Row l="admin" r="impersonation — audited" tone="amber" />
        </Tile>
      </Part>

      {/* row 2 right — documents & notifications */}
      <Part
        p={p}
        from={{ x: 340, y: 200 }}
        win={[0.62, 0.76]}
        style={{
          left: rightX,
          top: r2y + opsH + gap,
          width: rightW,
          height: r2h - opsH - gap,
        }}
      >
        <Tile
          title="Artifacts & inbox"
          icon={FileText}
          src="artifacts · notifications"
        >
          <Row l="Q3 contract summary" r="v3 · shared" />
          <Row l="Renewal risk memo" r="draft" />
          <Row l="inbox" r="2 unread" tone="amber" />
        </Tile>
      </Part>
    </div>
  );
}

/* ---------- scene 2 overlay: the boundary, as code ---------- */

const CODE: { text: string; step: "admit" | "run" | "settle" | "none" }[] = [
  { text: "const run = await executions.begin({", step: "admit" },
  { text: "  workspaceId, userId, capability, model", step: "admit" },
  { text: "});", step: "admit" },
  { text: "if (!run.allowed) return refuse(run.reason);", step: "admit" },
  { text: "", step: "none" },
  { text: "// your framework, unmodified", step: "run" },
  { text: "const result = await yourAgent.generate(messages);", step: "run" },
  { text: "", step: "none" },
  { text: "await run.complete({ usage: result.usage });", step: "settle" },
  { text: "// or, in catch: await run.fail({ error });", step: "settle" },
];

function BoundaryPanel({ run }: { run: MotionValue<number> }) {
  const { rightX, r2y, rightW, r2h } = G;
  const x = useTransform(run, [0.04, 0.14], [rightW + 40, 0]);
  const opacity = useTransform(run, [0.04, 0.12, 0.94, 1], [0, 1, 1, 0]);
  const active = useTransform<number, string>(run, (v) =>
    v < 0.2 ? "none" : v < 0.42 ? "admit" : v < 0.68 ? "run" : "settle"
  );
  return (
    <motion.div
      style={{ x, opacity, left: rightX, top: r2y, width: rightW, height: r2h }}
      className="absolute flex flex-col overflow-hidden rounded-md border border-line-strong bg-paper shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)] will-change-transform"
    >
      <div className="mono flex items-center justify-between border-b border-line px-2.5 py-1.5 text-[9px] text-ink-faint">
        <span>app/api/chat/route.ts</span>
        <span>the execution boundary</span>
      </div>
      <div className="mono flex-1 overflow-hidden p-2.5 text-[9px] leading-[1.6]">
        {CODE.map((l, i) => (
          <CodeLine key={i} l={l} active={active} />
        ))}
      </div>
      <div className="mono border-t border-line px-2.5 py-1.5 text-[8.5px] text-ink-faint">
        <motion.span>
          {useTransform<string, string>(active, (a) =>
            a === "admit"
              ? "ADMIT · plan checked through a port, worst-case cost held"
              : a === "run"
                ? "RUN · no wrapper, no agent API — the handle knows nothing about messages"
                : a === "settle"
                  ? "SETTLE · tokens and cost recorded, idempotent — no double billing"
                  : "waiting for a message"
          )}
        </motion.span>
      </div>
    </motion.div>
  );
}

function CodeLine({
  l,
  active,
}: {
  l: (typeof CODE)[number];
  active: MotionValue<string>;
}) {
  const bg = useTransform(active, (a) =>
    a === l.step ? "var(--accent-soft)" : "transparent"
  );
  const color = useTransform(active, (a) =>
    a === "none" || a === l.step ? "var(--ink)" : "var(--ink-faint)"
  );
  return (
    <motion.div
      style={{ background: bg, color }}
      className="-mx-1 whitespace-pre rounded-sm px-1"
    >
      {l.text || " "}
    </motion.div>
  );
}

/* ---------- scene 3 overlay: the installed page, as source ---------- */

const TREE = [
  ["app/[locale]/(app)/chat/page.tsx", false],
  ["components/chat/chat-panel.tsx", false],
  ["components/chat/message.tsx", false],
  ["actions.ts", false],
  ["lib/chat-config.tsx", true],
  ["messages/en/chat.json", false],
] as const;

function Editor({
  yours,
  time,
}: {
  yours: MotionValue<number>;
  time: MotionValue<number>;
}) {
  const EW = 390;
  const xIn = useTransform(yours, [0.02, 0.14], [-EW - 40, 0]);
  const xOut = useTransform(time, [0, 0.14], [0, -EW - 40]);
  const x = useTransform(() => xIn.get() + xOut.get());
  const opacity = useTransform(yours, [0.02, 0.1], [0, 1]);
  const name = useTyped(yours, 0.3, 0.5, "Contract Copilot");
  const oldName = useTransform(yours, (v) =>
    "Assistant".slice(0, Math.round((1 - seg(v, 0.22, 0.3)) * 9))
  );
  const tagline = useTyped(yours, 0.5, 0.6, "Ask about any clause");
  const oldTag = useTransform(yours, (v) =>
    "Ask anything".slice(0, Math.round((1 - seg(v, 0.44, 0.5)) * 12))
  );
  const modified = useTransform(yours, [0.6, 0.64], [0, 1]);
  return (
    <motion.div
      style={{ x, opacity, left: 0, top: 20, width: EW, height: H - 40 }}
      className="absolute flex overflow-hidden rounded-lg border border-line-strong bg-paper shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)] will-change-transform"
    >
      <div className="mono w-[150px] shrink-0 border-r border-line bg-paper-sunken/60 p-2.5 text-[9px]">
        <div className="mb-2 text-ink-faint">
          my-app · installed by shadcn add
        </div>
        {TREE.map(([f, hot]) => (
          <div
            key={f}
            className={cn(
              "flex items-center justify-between truncate rounded-sm px-1 py-[3px]",
              hot ? "bg-paper text-ink" : "text-ink-dim"
            )}
          >
            <span className="truncate">{f}</span>
            {hot && (
              <motion.span style={{ opacity: modified }} className="text-amber">
                M
              </motion.span>
            )}
          </div>
        ))}
        <div className="mt-3 border-t border-line pt-2 text-ink-faint">
          consumer-owned · not a dependency
        </div>
      </div>
      <div className="mono flex-1 p-3 text-[10px] leading-[1.65] text-ink">
        <div className="mb-2 text-ink-faint">lib/chat-config.tsx</div>
        <div>
          <span className="text-amber">export const</span> chatConfig = {"{"}
        </div>
        <div className="pl-3">agent: {"{"}</div>
        <div className="pl-6">
          name:{" "}
          <span className="text-settle">
            "<motion.span>{oldName}</motion.span>
            <motion.span>{name}</motion.span>"
          </span>
          ,
        </div>
        <div className="pl-6">
          tagline:{" "}
          <span className="text-settle">
            "<motion.span>{oldTag}</motion.span>
            <motion.span>{tagline}</motion.span>"
          </span>
          ,
        </div>
        <div className="pl-3">{"},"}</div>
        <div className="pl-3">
          starters: [
          <span className="text-settle">"Summarise this contract"</span>,{" "}
          <span className="text-settle">"Flag renewal risks"</span>],
        </div>
        <div className="pl-3">
          autoContinue: <span className="text-amber">true</span>,
        </div>
        <div>{"};"}</div>
        <div className="mt-4 text-ink-faint">
          // components/chat/* — unchanged
        </div>
        <div className="text-ink-faint">
          // re-install the item later: your config survives
        </div>
      </div>
    </motion.div>
  );
}

/* ---------- scene 4 overlay: a release lands ---------- */

const UPGRADE: Line[] = [
  { text: "intelligo upgrade --check", tone: "cmd" },
  {
    text: `@intelligo-dev/* ${PACKAGE_VERSION} → ${NEXT_VERSION} · 12 generated files compared`,
    tone: "dim",
  },
  { text: "✓ migrations — 1 new, shipped in @intelligo-dev/core", tone: "ok" },
  { text: "● lib/chat-config.tsx — customized, kept", tone: "amber" },
  { text: "● lib/nav-config.ts — customized, kept", tone: "amber" },
  {
    text: "10 current · 2 customized · 0 conflict — nothing overwritten",
    tone: "ok",
  },
];

function UpgradeTerminal({ time }: { time: MotionValue<number> }) {
  const { rightX, r2y, rightW, r2h, opsH, gap } = G;
  const y = useTransform(time, [0.06, 0.16], [60, 0]);
  const opacity = useTransform(time, [0.06, 0.14], [0, 1]);
  return (
    <motion.div
      style={{
        y,
        opacity,
        left: rightX,
        top: r2y + opsH + gap,
        width: rightW,
        height: r2h - opsH - gap,
      }}
      className="absolute flex flex-col overflow-hidden rounded-md border border-line-strong bg-paper-sunken shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)] will-change-transform"
    >
      <div className="mono flex items-center gap-1.5 border-b border-line px-2.5 py-1 text-[9px] text-ink-faint">
        <span className="size-1.5 rounded-full bg-line-strong" />
        <span className="size-1.5 rounded-full bg-line-strong" />
        <span className="size-1.5 rounded-full bg-line-strong" />
        <span className="ml-1">my-app — zsh</span>
      </div>
      <div className="mono flex-1 space-y-px p-2.5 text-[9px] leading-[1.5]">
        {UPGRADE.map((l, i) => {
          const start = 0.18 + (i / UPGRADE.length) * 0.5;
          return (
            <UpgradeLine
              key={i}
              line={l}
              opacity={useTransform(time, [start, start + 0.02], [0, 1])}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

function UpgradeLine({
  line,
  opacity,
}: {
  line: Line;
  opacity: MotionValue<number>;
}) {
  return (
    <motion.div
      style={{ opacity }}
      className={cn(
        "whitespace-pre-wrap break-words",
        line.tone === "cmd" && "text-ink",
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

/* ---------- the application on the stage, across scenes ---------- */

function App({
  build,
  run,
  yours,
  time,
}: {
  build: MotionValue<number>;
  run: MotionValue<number>;
  yours: MotionValue<number>;
  time: MotionValue<number>;
}) {
  const local = useTransform(build, ACT.app, [0, 1]);
  const opacity = useTransform(build, [ACT.app[0], ACT.app[0] + 0.04], [0, 1]);
  // scene 3 makes room for the editor on the left; scene 4 takes it back
  const shrinkIn = useTransform(yours, [0.02, 0.16], [1, 0.58]);
  const shrinkOut = useTransform(time, [0, 0.14], [0, 1]);
  const scale = useTransform(
    () => shrinkIn.get() + (1 - shrinkIn.get()) * shrinkOut.get()
  );
  return (
    <motion.div style={{ opacity }} className="absolute inset-0">
      <motion.div
        style={{ scale, transformOrigin: "right center" }}
        className="absolute inset-0 will-change-transform"
      >
        <Stage p={local} run={run} yours={yours} time={time} />
        <BoundaryPanel run={run} />
        <UpgradeTerminal time={time} />
      </motion.div>
      <Editor yours={yours} time={time} />
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
    const fit = () =>
      setScale(Math.min(1, el.getBoundingClientRect().width / width));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return { ref, scale };
}

export function Film() {
  const reduce = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const p = useTrackProgress(track);
  const build = useTransform(p, SCENE.build, [0, 1]);
  const run = useTransform(p, SCENE.run, [0, 1]);
  const yours = useTransform(p, SCENE.yours, [0, 1]);
  const time = useTransform(p, SCENE.time, [0, 1]);

  const [step, setStep] = useState(0);
  useMotionValueEvent(p, "change", (v) => {
    let i = 0;
    STEPS.forEach((s, n) => {
      if (v >= s.at) i = n;
    });
    setStep(i);
  });
  const { ref, scale } = useScale(W);
  const pct = useTransform(p, (v) => `${Math.round(v * 100)}%`);
  const done = useTransform(p, [0.97, 1], [0, 1]);
  const scene = STEPS[step]!.scene;

  // Reduced motion: the finished application, no pinning.
  if (reduce) {
    return (
      <div ref={track}>
        <div ref={ref} className="overflow-hidden">
          <div style={{ height: H * scale }}>
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <StaticStage />
            </div>
          </div>
        </div>
        <Rail scene={SCENES.length - 1} step="Still yours" className="mt-6" />
      </div>
    );
  }

  return (
    <div ref={track} className="relative" style={{ height: "1500vh" }}>
      <div className="sticky top-14 flex min-h-[calc(100vh-3.5rem)] flex-col justify-center py-6">
        <div className="grid gap-6 lg:grid-cols-[250px_1fr] lg:gap-10">
          <div className="order-2 lg:order-1">
            <Rail scene={scene} step={STEPS[step]!.label} />
            <div className="mt-5 hidden lg:block">
              <div className="mono flex items-center justify-between text-[0.68rem] uppercase tracking-[0.08em] text-ink-faint">
                <span>
                  scene {SCENES[scene]!.n} / 0{SCENES.length}
                </span>
                <motion.span className="tabular-nums">{pct}</motion.span>
              </div>
              <div className="mt-1 text-[1.05rem] font-semibold text-ink">
                {SCENES[scene]!.title}
              </div>
              <p className="mt-2 text-[0.88rem] text-ink-dim">
                {SCENES[scene]!.note}
              </p>
              <motion.p
                style={{ opacity: done }}
                className="mono mt-4 text-[0.72rem] text-settle"
              >
                ✓ every part but one is on npm or in the registry. The one is
                yours.
              </motion.p>
            </div>
          </div>
          <div ref={ref} className="order-1 overflow-hidden lg:order-2">
            <div style={{ height: H * scale }}>
              <div
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              >
                <div
                  className="relative overflow-hidden rounded-xl"
                  style={{ width: W, height: H }}
                >
                  <Moments p={build} />
                  <Terminal p={build} />
                  <App build={build} run={run} yours={yours} time={time} />
                </div>
              </div>
            </div>
            <p className="mono mt-3 text-center text-[0.7rem] text-ink-faint lg:hidden">
              <span className="text-ink-dim">{SCENES[scene]!.title}</span> ·{" "}
              {STEPS[step]!.label}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Rail({
  scene,
  step,
  className,
}: {
  scene: number;
  step: string;
  className?: string;
}) {
  return (
    <ol
      className={cn(
        "flex flex-wrap gap-1 lg:flex-col lg:gap-0 lg:border-t lg:border-line",
        className
      )}
      aria-label="Scenes"
    >
      {SCENES.map((s, i) => (
        <li
          key={s.id}
          className={cn(
            "mono rounded-sm border border-line px-2 py-1 text-[0.72rem] transition-colors lg:rounded-none lg:border-x-0 lg:border-t-0 lg:border-b lg:px-0 lg:py-2.5",
            i < scene
              ? "text-ink-dim"
              : i === scene
                ? "border-amber text-ink lg:border-line"
                : "text-ink-faint"
          )}
        >
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block size-1.5 rounded-full",
                i < scene
                  ? "bg-settle"
                  : i === scene
                    ? "bg-amber"
                    : "bg-line-strong"
              )}
            />
            <span className="text-ink-faint">{s.n}</span>
            <span>{s.title}</span>
          </span>
          {i === scene && (
            <span className="mt-1 hidden pl-[1.6rem] text-[0.7rem] text-amber lg:block">
              {step}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** The assembled state, for reduced motion and as the no-JS fallback. */
function StaticStage() {
  const one = useTransform(() => 1);
  return <Stage p={one} run={one} yours={one} time={one} />;
}
