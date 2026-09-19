import type { CSSProperties, ReactNode } from "react";
import type { UIMessage } from "ai";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { loadFont as loadOutfit } from "@remotion/google-fonts/Outfit";
import { cn } from "./lib";
import { clamp01, interp, rnd, seg, typed } from "./interp";
import {
  PACKAGES,
  PACKAGE_VERSION,
  REGISTRY_ITEMS,
  type RegistryGroup,
  type RegistryItem,
} from "./data";
import { FilmProviders, USER, WORKSPACE, WORKSPACES } from "./FilmProviders";
import { AppSidebar } from "@ui/components/shell/app-sidebar";
import { ShellHeader } from "@ui/components/shell/shell-header";
import { SidebarProvider } from "@ui/components/ui/sidebar";
import { DashboardHero } from "@ui/components/dashboard/dashboard-hero";
import { PromptBar } from "@ui/components/dashboard/prompt-bar";
import { MessageList } from "@ui/components/chat/message-list";
import { ChatInput } from "@ui/components/chat/chat-input";
import { PathnameContext } from "@ui/i18n/navigation";
import { useFormatter, useTranslations } from "use-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@ui/components/ui/page-header";
import {
  StatCard,
  StatCardHeader,
  StatCardLabel,
  StatCardValue,
} from "@ui/components/ui/stat-card";
import { StatusBadge } from "@ui/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { chatConfig } from "@ui/lib/chat-config";

/**
 * The project film: eight acts on one 0 → 1 track, silent, carried by the
 * line in the lower third. The problem (an agent that works and is not a
 * product), one command, the pages assembling as source, the running
 * product, a message crossing the execution boundary, the usage page that
 * run lands on, the config seam, and the closing card.
 *
 * The shell, dashboard, chat and usage surfaces are the registry's own
 * components (src/ui — see scripts/sync-ui.mjs). Every value is a plain
 * `interp()` of `frame / durationInFrames`, evaluated once per frame.
 */

const W = 960;
const H = 600;

/** The stage renders at this scale inside the 1920×1080 composition,
 * filling the frame's height edge to edge with a fixed side margin. */
const SCALE = 1.5;
/** Reserved band at the bottom of the composition for the script line,
 * so it never overlaps the stage's own bottom-anchored content. */
const CAPTION_BAND = 140;

/**
 * The acts. Each gets its own clamped 0 → 1 local progress (see
 * `Film()`); a component reads the one that is its own and holds its end
 * state once that act has passed, which is how the assembled tray or the
 * finished exchange persist into later acts.
 */
const SCENE = {
  hook: [0, 0.12] as [number, number],
  terminal: [0.12, 0.22] as [number, number],
  blocks: [0.22, 0.42] as [number, number],
  dashboard: [0.42, 0.5] as [number, number],
  chat1: [0.5, 0.7] as [number, number],
  ledger: [0.7, 0.8] as [number, number],
  customize: [0.8, 0.9] as [number, number],
  ending: [0.9, 1] as [number, number],
};

/** the tray fades out right at the blocks → dashboard handoff, so the
 * pages you just built stay visible as a backdrop until the real
 * product reveal starts */
const TRAY_CLEAR: [number, number] = [
  SCENE.blocks[1] - 0.03,
  SCENE.dashboard[0] + 0.02,
];

/** the 4 moments split nearly the whole blocks act between them */
const MOMENTS_RANGE: [number, number] = [0.02, 0.96];

type Moment = {
  id: string;
  title: string;
  sub: string;
  items: string[];
  kind: "page" | "grid";
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
  const [a, b] = MOMENTS_RANGE;
  const len = (b - a) / MOMENTS.length;
  return [a + k * len, a + (k + 1) * len];
}

const SCENES = [
  { n: "01", title: "The other half" },
  { n: "02", title: "One command" },
  { n: "03", title: "Pages assemble" },
  { n: "04", title: "Your product" },
  { n: "05", title: "The execution boundary" },
  { n: "06", title: "On the record" },
  { n: "07", title: "Make it yours" },
  { n: "08", title: "Now build yours" },
] as const;

/**
 * The script. `line` is the sentence a muted viewer reads — it holds
 * across consecutive beats that share it; `label` is the small print
 * under it, naming what is on screen right now.
 */
type Beat = { scene: number; at: number; line: string; label: string };
const g = (win: [number, number], f: number) => win[0] + f * (win[1] - win[0]);

const HOOK_BEATS = { missing: 0.33, same: 0.65 };

const LINE = {
  terminal: "Intelligo ships that half. One command.",
  blocks: "Every page lands as your own source.",
  dashboard: "A running product. Day one.",
  chat1: "Your agent runs unmodified.",
  ledger: "Every run, accounted for.",
  customize: "Make it yours — config, not forks.",
};

const BEATS: Beat[] = [
  {
    scene: 0,
    at: g(SCENE.hook, 0),
    line: "Your agent works.",
    label: "prompts · tools · the domain only you know",
  },
  {
    scene: 0,
    at: g(SCENE.hook, HOOK_BEATS.missing),
    line: "It isn't a product yet.",
    label: "sign-up · workspaces · plans · credits · invoices · usage · audit",
  },
  {
    scene: 0,
    at: g(SCENE.hook, HOOK_BEATS.same),
    line: "That half is the same in every AI SaaS.",
    label: "and it is where the months go",
  },
  {
    scene: 1,
    at: g(SCENE.terminal, 0),
    line: LINE.terminal,
    label: "intelligo create",
  },
  {
    scene: 1,
    at: g(SCENE.terminal, 0.4),
    line: LINE.terminal,
    label: "Packages installed",
  },
  {
    scene: 1,
    at: g(SCENE.terminal, 0.72),
    line: LINE.terminal,
    label: "Pages installed as source",
  },
  ...MOMENTS.map((m, k) => ({
    scene: 2,
    at: g(SCENE.blocks, momentWindow(k)[0]),
    line: LINE.blocks,
    label: `${m.title} — ${m.items.length} pages`,
  })),
  {
    scene: 3,
    at: g(SCENE.dashboard, 0),
    line: LINE.dashboard,
    label: "Shell, dashboard and chat — running",
  },
  {
    scene: 3,
    at: g(SCENE.dashboard, 0.7),
    line: LINE.dashboard,
    label: "Your agent lands in its seam",
  },
  {
    scene: 4,
    at: g(SCENE.chat1, 0),
    line: LINE.chat1,
    label: "A message goes in",
  },
  {
    scene: 4,
    at: g(SCENE.chat1, 0.24),
    line: LINE.chat1,
    label: "Admit — plan checked, worst-case cost held",
  },
  {
    scene: 4,
    at: g(SCENE.chat1, 0.4),
    line: LINE.chat1,
    label: "Run — your framework, no wrapper",
  },
  {
    scene: 4,
    at: g(SCENE.chat1, 0.66),
    line: LINE.chat1,
    label: "Settle — tokens and cost recorded, once",
  },
  {
    scene: 5,
    at: g(SCENE.ledger, 0),
    line: LINE.ledger,
    label: "The run lands on the workspace's usage page",
  },
  {
    scene: 5,
    at: g(SCENE.ledger, 0.4),
    line: LINE.ledger,
    label: "Tokens, charge and plan quota — settled",
  },
  {
    scene: 6,
    at: g(SCENE.customize, 0),
    line: LINE.customize,
    label: "Open lib/chat-config.tsx",
  },
  {
    scene: 6,
    at: g(SCENE.customize, 0.4),
    line: LINE.customize,
    label: "Edit the agent's identity",
  },
  {
    scene: 6,
    at: g(SCENE.customize, 0.75),
    line: LINE.customize,
    label: "Hot reload — components untouched",
  },
  { scene: 7, at: g(SCENE.ending, 0), line: "", label: "" },
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
  p: number;
  from: Vec;
  win: [number, number];
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  const x = interp(p, win, [from.x ?? 0, 0]);
  const y = interp(p, win, [from.y ?? 0, 0]);
  const rotate = interp(p, win, [from.r ?? 0, 0]);
  const scale = interp(p, win, [from.s ?? 1, 1]);
  const opacity = interp(p, [win[0], win[0] + (win[1] - win[0]) * 0.6], [0, 1]);
  return (
    <div
      style={{
        ...style,
        transform: `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scale})`,
        opacity,
      }}
      className={cn("absolute", className)}
    >
      {children}
    </div>
  );
}

/* ---------- act 1: blocks become pages ---------- */

type Block = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "bar" | "box" | "input" | "btn" | "text" | "chart" | "bubble" | "side";
};

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
    case "dashboard":
      // The real page: packages/registry/base/dashboard/page.tsx — a
      // centered hero (icon, h1, subtitle) and a composer below it,
      // deliberately nothing else.
      return [
        { x: 42, y: 14, w: 16, h: 14, kind: "box" },
        { x: 22, y: 36, w: 56, h: 11, kind: "text" },
        { x: 30, y: 51, w: 40, h: 7, kind: "text" },
        { x: 14, y: 72, w: 72, h: 17, kind: "input" },
      ];
    case "auth-login":
      // The real page: AuthCard's icon, title/subtitle, two social
      // buttons side by side, then the email/password form itself.
      return [
        { x: 40, y: 4, w: 20, h: 12, kind: "box" },
        { x: 20, y: 20, w: 60, h: 8, kind: "text" },
        { x: 20, y: 32, w: 60, h: 6, kind: "text" },
        { x: 20, y: 44, w: 28, h: 10, kind: "bar" },
        { x: 52, y: 44, w: 28, h: 10, kind: "bar" },
        { x: 20, y: 60, w: 60, h: 11, kind: "input" },
        { x: 20, y: 75, w: 60, h: 11, kind: "input" },
        { x: 20, y: 90, w: 60, h: 8, kind: "btn" },
      ];
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
      // The real page: a header, two turns of conversation, and the
      // composer — the same shape the real Stage now renders for real.
      return [
        { x: 0, y: 0, w: 22, h: 100, kind: "side" },
        { x: 26, y: 2, w: 70, h: 7, kind: "bar" },
        { x: 50, y: 13, w: 44, h: 10, kind: "bubble" },
        { x: 26, y: 27, w: 52, h: 18, kind: "box" },
        { x: 50, y: 49, w: 44, h: 8, kind: "bubble" },
        { x: 26, y: 61, w: 40, h: 13, kind: "box" },
        { x: 26, y: 80, w: 60, h: 14, kind: "input" },
        { x: 89, y: 80, w: 7, h: 14, kind: "btn" },
      ];
    case "artifacts":
      // The real page: a document list on the left, a preview on the
      // right — DocumentList beside a canvas viewer.
      return [
        { x: 0, y: 0, w: 22, h: 100, kind: "side" },
        { x: 26, y: 4, w: 70, h: 8, kind: "text" },
        { x: 26, y: 16, w: 30, h: 14, kind: "box" },
        { x: 26, y: 33, w: 30, h: 14, kind: "box" },
        { x: 26, y: 50, w: 30, h: 14, kind: "box" },
        { x: 60, y: 16, w: 36, h: 76, kind: "chart" },
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
          className={cn(base, "rounded-none border-r border-border bg-muted")}
        />
      );
    case "bar":
      return <div className={cn(base, "border border-border bg-background")} />;
    case "box":
      return <div className={cn(base, "border border-border bg-card")} />;
    case "input":
      return (
        <div
          className={cn(base, "border border-foreground/15 bg-background")}
        />
      );
    case "btn":
      return <div className={cn(base, "bg-foreground")} />;
    case "text":
      return <div className={cn(base, "rounded-sm bg-foreground/15")} />;
    case "bubble":
      return <div className={cn(base, "rounded-md bg-foreground")} />;
    case "chart":
      return (
        <div
          className={cn(
            base,
            "flex items-end gap-[2px] border border-border bg-background px-1 pb-1",
          )}
        >
          {[40, 70, 55, 90, 65, 80].map((h, i) => (
            <span
              key={i}
              className="flex-1 rounded-t-[1px] bg-foreground/70"
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
  local: number;
  seed: number;
  name: string;
  group: RegistryGroup;
  w: number;
  h: number;
  label?: boolean;
}) {
  const blocks = layoutFor(name, group);
  const bodyH = h - (label ? 18 : 0);
  const frameOp = interp(local, [0, 0.15], [0, 1]);
  const labelOp = interp(local, [0.8, 1], [0, 1]);
  return (
    <div
      style={{ width: w, height: h, opacity: frameOp }}
      className="relative rounded-md border border-border bg-card"
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
        <div
          style={{ opacity: labelOp }}
          className="mono absolute inset-x-0 top-0 flex h-[18px] items-center justify-between border-b border-border px-2 text-[8.5px] text-foreground/70"
        >
          <span className="truncate">{name}</span>
          <span className="text-muted-foreground">{group.toLowerCase()}</span>
        </div>
      )}
    </div>
  );
}

const HERO = { x: 220, y: 74, w: 520, h: 320 };
const TRAY = { y: 462, w: 196, h: 121, gap: 30 };
const trayX = (k: number) =>
  (W - MOMENTS.length * TRAY.w - (MOMENTS.length - 1) * TRAY.gap) / 2 +
  k * (TRAY.w + TRAY.gap);

function MomentView({
  p,
  k,
  m,
  fade,
}: {
  p: number;
  k: number;
  m: Moment;
  fade: number;
}) {
  const [a, b] = momentWindow(k);
  const len = b - a;
  const build: [number, number] = [a, a + len * 0.62];
  const park: [number, number] = [a + len * 0.78, b];
  const local = interp(p, build, [0, 1]);

  const sc = TRAY.w / HERO.w;
  const scale = interp(p, park, [1, sc]);
  const x = interp(p, park, [HERO.x, trayX(k)]);
  const y = interp(p, park, [HERO.y, TRAY.y]);
  const opacity = interp(p, [a, a + 0.005], [0, 1]) * fade;

  const headOp = interp(
    p,
    [a + len * 0.05, a + len * 0.18, park[0], park[0] + len * 0.1],
    [0, 1, 1, 0],
  );
  const headY = interp(p, [a + len * 0.05, a + len * 0.18], [12, 0]);
  const checkOp = interp(p, [build[1], build[1] + len * 0.08], [0, 1]);
  const chipOp = interp(p, [park[1] - len * 0.05, park[1]], [0, 1]) * fade;

  const cols = 4;
  const gap = 10;
  const cw = Math.floor((HERO.w - gap * (cols - 1)) / cols);
  const rows = Math.ceil(m.items.length / cols);
  const ch = Math.floor((HERO.h - gap * (rows - 1)) / rows);

  return (
    <>
      <div
        style={{ opacity: headOp, transform: `translateY(${headY}px)` }}
        className="absolute inset-x-0 top-5 flex flex-col items-center text-center"
      >
        <div className="heading flex items-center gap-2 text-[26px] font-semibold leading-none text-foreground">
          {m.title}
          <span
            style={{ opacity: checkOp }}
            className="mono rounded-full border border-success/40 px-2 py-0.5 text-[11px] font-medium text-success"
          >
            ✓ created · {m.items.length}{" "}
            {m.items.length === 1 ? "page" : "pages"}
          </span>
        </div>
        <div className="mono mt-1.5 text-[11px] text-muted-foreground">
          {m.sub}
        </div>
      </div>

      <div
        style={{
          transform: `translate(${x}px, ${y}px) scale(${scale})`,
          opacity,
          transformOrigin: "top left",
        }}
        className="absolute left-0 top-0"
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
              const it = REGISTRY_ITEMS.find(
                (r: RegistryItem) => r.name === name,
              )!;
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
      </div>

      <div
        style={{
          opacity: chipOp,
          left: trayX(k),
          top: TRAY.y + TRAY.h + 6,
          width: TRAY.w,
        }}
        className="mono absolute flex items-center justify-between text-[10px]"
      >
        <span className="text-foreground">{m.title}</span>
        <span className="text-success">✓ {m.items.length}</span>
      </div>
    </>
  );
}

function GridCard({
  local,
  i,
  n,
  name,
  group,
  w,
  h,
}: {
  local: number;
  i: number;
  n: number;
  name: string;
  group: RegistryGroup;
  w: number;
  h: number;
}) {
  const mine = interp(local, [(i / n) * 0.6, (i / n) * 0.6 + 0.4], [0, 1]);
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

function Moments({ p, fade }: { p: number; fade: number }) {
  return (
    <div className="absolute inset-0">
      {MOMENTS.map((m, k) => (
        <MomentView key={m.id} p={p} k={k} m={m} fade={fade} />
      ))}
    </div>
  );
}

/* ---------- the hook: an agent that works, and everything it lacks ---------- */

const AGENT = { x: 310, y: 190, w: 340, h: 220 };

const AGENT_CODE = [
  "const agent = new Agent({",
  "  model,",
  "  tools: { searchContract },",
  "  instructions: contractReview,",
  "});",
  "",
  "await agent.generate(question);",
];

const AGENT_OUTPUT = "§4.2 renews in 90 days. §7 has no cap.";

/** What a product needs around the agent, as the slots it leaves empty. */
const MISSING: { label: string; x: number; y: number; w: number; h: number }[] =
  [
    { label: "sign-up & login", x: 50, y: 44, w: 270, h: 112 },
    { label: "workspaces & roles", x: 345, y: 44, w: 270, h: 112 },
    { label: "team invitations", x: 640, y: 44, w: 270, h: 112 },
    { label: "plans & limits", x: 50, y: 190, w: 230, h: 220 },
    { label: "credits", x: 680, y: 190, w: 230, h: 220 },
    { label: "checkout & invoices", x: 50, y: 444, w: 270, h: 112 },
    { label: "usage & cost", x: 345, y: 444, w: 270, h: 112 },
    { label: "audit trail", x: 640, y: 444, w: 270, h: 112 },
  ];

function Hook({ p }: { p: number }) {
  const opacity = interp(p, [0, 0.05, 0.92, 1], [0, 1, 1, 0]);
  const scale = interp(p, [0.92, 1], [1, 0.97]);
  const code = AGENT_CODE.join("\n");
  const shown = typed(p, 0.04, 0.2, code);
  const outputOp = interp(p, [0.22, 0.27], [0, 1]);
  const same = interp(p, [HOOK_BEATS.same, HOOK_BEATS.same + 0.08], [0, 1]);
  return (
    <div
      style={{ opacity, transform: `scale(${scale})` }}
      className="absolute inset-0"
    >
      {MISSING.map((m, i) => {
        const start = HOOK_BEATS.missing + (i / MISSING.length) * 0.24;
        const op = interp(p, [start, start + 0.05], [0, 1]);
        const rise = interp(p, [start, start + 0.05], [8, 0]);
        return (
          <div
            key={m.label}
            style={{
              left: m.x,
              top: m.y,
              width: m.w,
              height: m.h,
              opacity: op,
              transform: `translateY(${rise}px)`,
              borderColor: `color-mix(in oklab, var(--foreground) ${Math.round(
                22 + same * 28,
              )}%, transparent)`,
            }}
            className="absolute flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed"
          >
            <span className="heading text-[15px] font-medium text-foreground">
              {m.label}
            </span>
            <span className="mono text-[10px] text-muted-foreground">
              {"// TODO"}
            </span>
          </div>
        );
      })}

      <div
        style={{
          left: AGENT.x,
          top: AGENT.y,
          width: AGENT.w,
          height: AGENT.h,
        }}
        className="absolute flex flex-col overflow-hidden rounded-lg border border-foreground/15 bg-background shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]"
      >
        <div className="mono flex items-center justify-between border-b border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          <span>agent.ts</span>
          <span style={{ opacity: same }} className="text-foreground">
            your half
          </span>
        </div>
        <pre className="mono m-0 flex-1 whitespace-pre px-3 py-2.5 text-[11px] leading-[1.6] text-foreground">
          {shown}
        </pre>
        <div
          style={{ opacity: outputOp }}
          className="mono flex items-center gap-2 border-t border-border px-3 py-2 text-[10.5px]"
        >
          <span className="text-success">✓</span>
          <span className="truncate text-foreground">{AGENT_OUTPUT}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- the terminal ---------- */

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
  { text: "pnpm db:migrate && pnpm dev", tone: "cmd" },
  { text: "▲ ready on http://localhost:3000", tone: "amber" },
];

/** Lines 0–2 are the scaffold itself (`create`, its two confirmations) —
 * paced generously, the moment the film is actually about. Everything
 * after (package installs, the registry install, db:push/dev, ready)
 * is the build's own busywork: it should rush by, not linger. */
const SCAFFOLD_DONE = 3;

function TermLine({ p, i, line }: { p: number; i: number; line: Line }) {
  const start =
    i < SCAFFOLD_DONE
      ? 0.08 + (i / SCAFFOLD_DONE) * 0.32
      : 0.42 + ((i - SCAFFOLD_DONE) / (LINES.length - SCAFFOLD_DONE)) * 0.4;
  const opacity = interp(p, [start, start + 0.012], [0, 1]);
  return (
    <div
      style={{ opacity }}
      className={cn(
        "whitespace-pre-wrap break-words",
        line.tone === "cmd" && "mt-2 text-foreground first:mt-0",
        line.tone === "ok" && "text-success",
        line.tone === "dim" && "text-foreground/70",
        line.tone === "amber" && "text-foreground",
      )}
    >
      {line.tone === "cmd" && <span className="text-muted-foreground">$ </span>}
      {line.text}
    </div>
  );
}

function Terminal({ p }: { p: number }) {
  const y = interp(p, [0, 0.06], [-60, 0]);
  const opacity = interp(p, [0, 0.06, 0.9, 1], [0, 1, 1, 0]);
  const scale = interp(p, [0.9, 1], [1, 0.9]);
  return (
    <div
      style={{
        transform: `translateY(${y}px) scale(${scale})`,
        opacity,
        left: 200,
        top: 22,
        width: 560,
        height: 420,
      }}
      className="absolute flex flex-col overflow-hidden rounded-lg border border-border bg-muted shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]"
    >
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border px-3">
        <span className="size-2 rounded-full bg-foreground/15" />
        <span className="size-2 rounded-full bg-foreground/15" />
        <span className="size-2 rounded-full bg-foreground/15" />
        <span className="mono ml-2 text-[10px] text-muted-foreground">
          my-app — zsh
        </span>
      </div>
      <div className="mono flex-1 space-y-0.5 overflow-hidden p-4 text-[11px] leading-[1.55]">
        {LINES.map((l, i) => (
          <TermLine key={i} p={p} i={i} line={l} />
        ))}
      </div>
    </div>
  );
}

/* ---------- the application: dashboard, then two real chat exchanges ---------- */

/** Sidebar width — matches `.film-stage [data-slot=...]`'s fit in index.css. */
const SB = 176;

/** What the dashboard's resume pill points back at — this film's own conversation. */
const RESUME = { href: "/chat/conv_1", label: "Q3 contract review" };

function DashboardScreen() {
  return (
    <div className="mx-auto max-w-xl space-y-8 px-6 py-12">
      <DashboardHero resume={RESUME} />
      <PromptBar />
    </div>
  );
}

/* ---- chat1: one exchange, paced by the boundary — the message is typed
 * and sent, admitted, and only then does the agent stream its answer ---- */

/** chat1's local timeline. */
const RUN = {
  sent: 0.1,
  pullBack: [0.12, 0.2] as [number, number],
  panelIn: [0.16, 0.24] as [number, number],
  admit: 0.24,
  run: 0.4,
  settle: 0.66,
  panelOut: [0.85, 0.89] as [number, number],
  restore: [0.89, 0.97] as [number, number],
};

const ASK1 = "Which clauses expose us at renewal?";
const ANSWER1 =
  "Two: the auto-renewal in §4.2 (90-day notice, already inside the window) and the price-escalator in §7 with no cap [1]. Recommend serving notice this week.";

function chat1Messages(r: number): UIMessage[] {
  if (r < RUN.sent) return [];
  const messages: UIMessage[] = [
    { id: "c1-u1", role: "user", parts: [{ type: "text", text: ASK1 }] },
  ];
  if (r > RUN.run) {
    // Fixture parts reach past the AI SDK's public UIMessage union for a
    // couple of experimental fields (source-url) message.tsx already
    // reads structurally — see lib/message-parts.ts's own `sourcesOf`.
    const parts: unknown[] = [];
    if (r > RUN.settle - 0.06) {
      parts.push({
        type: "source-url",
        sourceId: "c1-src-1",
        url: "https://acme.internal/contracts/q3-vendor.pdf",
        title: "Q3 Vendor Agreement · §7",
      });
    }
    parts.push({
      type: "text",
      text: typed(r, RUN.run + 0.02, RUN.settle, ANSWER1),
    });
    messages.push({
      id: "c1-a1",
      role: "assistant",
      parts: parts as UIMessage["parts"],
    });
  }
  return messages;
}

/* ---- usage: the page the settled run lands on ---- */

type UsageRow = {
  id: string;
  startedAt: string;
  status: "succeeded" | "settling" | "refused";
  tokens: number | null;
  charged: string | null;
};

const USAGE_MODEL = "google/gemini-2.5-flash";

const EARLIER_ROWS: UsageRow[] = [
  {
    id: "run_127",
    startedAt: "2026-08-29T08:41:00Z",
    status: "succeeded",
    tokens: 2310,
    charged: "$0.0164",
  },
  {
    id: "run_126",
    startedAt: "2026-08-29T08:17:00Z",
    status: "refused",
    tokens: null,
    charged: null,
  },
  {
    id: "run_125",
    startedAt: "2026-08-28T16:52:00Z",
    status: "succeeded",
    tokens: 1204,
    charged: "$0.0086",
  },
];

const STATUS_VARIANT = {
  succeeded: "success",
  settling: "warning",
  refused: "neutral",
} as const;

/** The run the film just showed: settling first, then on the books. */
const SETTLED_AT = 0.4;

function UsageScreen({ r }: { r: number }) {
  const t = useTranslations("usage");
  const format = useFormatter();
  const settled = r > SETTLED_AT;
  const glow = interp(r, [0.05, 0.15, 0.8, 1], [0, 1, 1, 0]);
  const rows: UsageRow[] = [
    {
      id: "run_128",
      startedAt: "2026-08-29T08:58:00Z",
      status: settled ? "succeeded" : "settling",
      tokens: settled ? 1842 : null,
      charged: settled ? "$0.0131" : null,
    },
    ...EARLIER_ROWS,
  ];
  const stats = [
    {
      label: t("summaryCards.requests"),
      value: format.number(settled ? 128 : 127),
    },
    {
      label: t("summaryCards.tokensUsed"),
      value: format.number(settled ? 216_232 : 214_390),
    },
    {
      label: t("summaryCards.chargedAmount"),
      value: settled ? "$1.54" : "$1.52",
    },
  ];
  const empty = t("recordsTable.empty");
  return (
    <div className="space-y-5 px-6 py-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{t("page.title")}</PageHeaderTitle>
          <PageHeaderDescription>{t("page.description")}</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <div className="grid grid-cols-3 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} size="sm">
            <StatCardHeader>
              <StatCardLabel>{stat.label}</StatCardLabel>
              <StatCardValue>{stat.value}</StatCardValue>
            </StatCardHeader>
          </StatCard>
        ))}
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("recordsTable.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("recordsTable.columns.started")}</TableHead>
                <TableHead>{t("recordsTable.columns.capability")}</TableHead>
                <TableHead>{t("recordsTable.columns.model")}</TableHead>
                <TableHead>{t("recordsTable.columns.status")}</TableHead>
                <TableHead className="text-right">
                  {t("recordsTable.columns.tokens")}
                </TableHead>
                <TableHead className="text-right">
                  {t("recordsTable.columns.chargedAmount")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow
                  key={row.id}
                  style={
                    i === 0
                      ? {
                          background: `color-mix(in oklab, var(--muted) ${Math.round(
                            glow * 100,
                          )}%, transparent)`,
                        }
                      : undefined
                  }
                >
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {format.dateTime(new Date(row.startedAt), {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>chat.message</TableCell>
                  <TableCell>{USAGE_MODEL}</TableCell>
                  <TableCell>
                    <StatusBadge status={STATUS_VARIANT[row.status]} dot>
                      {t(`recordsTable.status.${row.status}`)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.tokens !== null ? format.number(row.tokens) : empty}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.charged ?? empty}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

type Screen = "dashboard" | "chat" | "usage";

function ChatScreen({ r }: { r: number }) {
  const messages = chat1Messages(r);
  const isStreaming = r > RUN.sent && r < RUN.settle + 0.01;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        <MessageList
          conversationId="conv_1"
          messages={messages}
          isStreaming={isStreaming}
        />
      </div>
      <ChatInput
        conversationId="conv_1"
        value={r < RUN.sent ? typed(r, 0.01, RUN.sent - 0.015, ASK1) : ""}
        onChange={() => {}}
        onSend={() => {}}
        onStop={() => {}}
        isStreaming={false}
      />
    </div>
  );
}

/**
 * The real app-shell around a real page — `SidebarProvider` → `AppSidebar`
 * + a header-and-content column, not a hand-tuned grid of tiles.
 * `entrance` (0 → 1 across the dashboard act, clamped at 1 after) drives
 * the sidebar/header landing once; `screen` then switches the content
 * with no further entrance animation — a page swap, not a new scene.
 */
function Stage({
  entrance,
  screen,
  chatProgress,
  usageProgress,
  customized,
  identityRing,
  contentOpacity,
}: {
  entrance: number;
  screen: Screen;
  chatProgress: number;
  usageProgress: number;
  customized: boolean;
  /** 0 → 1: how strongly the header's agent identity is ringed. */
  identityRing: number;
  /** Dips to 0 across a page swap, so the content changes unseen. */
  contentOpacity: number;
}) {
  const pathname =
    screen === "dashboard"
      ? "/dashboard"
      : screen === "usage"
        ? "/usage"
        : "/chat/conv_1";
  const agentName = customized ? chatConfig.agent?.name : "Assistant";
  const agentIcon = customized ? chatConfig.agent?.icon : undefined;

  return (
    <div className="relative" style={{ width: W, height: H }}>
      {/* frame */}
      <Part
        p={entrance}
        from={{ s: 0.96 }}
        win={[0, 0.1]}
        style={{ inset: 0 }}
        className="rounded-xl border border-foreground/15 bg-card"
      >
        <span />
      </Part>

      <SidebarProvider
        className="film-app-frame absolute inset-0"
        style={{ "--sidebar-width": `${SB}px` } as CSSProperties}
      >
        <PathnameContext.Provider value={pathname}>
          {/* sidebar — the real AppSidebar, not a redrawing of it.
           * collapsible="none" in the copied src/ui snapshot (see
           * scripts/sync-ui.mjs — AppSidebar hardcodes "icon" and
           * doesn't expose the prop) so there's no icon-collapsed state
           * to account for; the CSS in index.css makes it fit this
           * fixed box instead of the svh viewport it assumes. */}
          <Part
            p={entrance}
            from={{ x: -260 }}
            win={[0.06, 0.2]}
            style={{ left: 0, top: 0, width: SB, height: H }}
            className="overflow-hidden rounded-l-xl border-r border-border"
          >
            <AppSidebar
              workspace={WORKSPACE}
              workspaces={WORKSPACES}
              user={USER}
            />
          </Part>

          {/* header + page — the real ShellHeader, and the real dashboard
           * or chat page underneath it. The dashboard page doesn't portal
           * anything into the header's slot; the chat screens do, with
           * the agent identity — "Assistant" until the customize act's
           * hot reload, then whatever `ui-overrides/lib/chat-config.tsx`
           * carries, matching the Editor overlay's own edit. */}
          <Part
            p={entrance}
            from={{ y: -140 }}
            win={[0.12, 0.26]}
            style={{ left: SB, top: 0, width: W - SB, height: H }}
            className="overflow-hidden rounded-r-xl bg-background"
          >
            <div className="flex h-full flex-col">
              <ShellHeader>
                {screen === "chat" && (
                  <span
                    style={{
                      boxShadow: `0 0 0 1.5px color-mix(in oklab, var(--foreground) ${Math.round(
                        identityRing * 55,
                      )}%, transparent)`,
                    }}
                    className="mr-1 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {agentIcon && <span aria-hidden>{agentIcon}</span>}
                    <span className="max-w-32 truncate">{agentName}</span>
                  </span>
                )}
              </ShellHeader>
              <div
                style={{ opacity: contentOpacity }}
                className="min-h-0 flex-1 overflow-hidden"
              >
                {screen === "dashboard" ? (
                  <DashboardScreen />
                ) : screen === "usage" ? (
                  <UsageScreen r={usageProgress} />
                ) : (
                  <ChatScreen r={chatProgress} />
                )}
              </div>
            </div>
          </Part>
        </PathnameContext.Provider>
      </SidebarProvider>
    </div>
  );
}

/* ---------- chat1 overlay: the boundary, as code ---------- */

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

/**
 * The boundary underneath the page. While a message crosses it the app
 * pulls back to the left (`APP_BACK`) and this panel takes the right of
 * the stage: the route's code, the three steps, and the money moving.
 */
const APP_BACK = { scale: 0.57, x: 16, y: 129 };
const BOUNDARY = { left: 578, top: 110, w: 370, h: 380 };

const BOUNDARY_STEPS = ["admit", "run", "settle"] as const;
type BoundaryStep = (typeof BOUNDARY_STEPS)[number];

const BOUNDARY_NOTE: Record<BoundaryStep | "none", string> = {
  none: "waiting for a message",
  admit: "plan checked through a port · worst-case cost held",
  run: "no wrapper, no agent API — the handle knows nothing about messages",
  settle: "tokens and cost recorded, idempotent — no double billing",
};

function BoundaryPanel({ chat1 }: { chat1: number }) {
  const x = interp(chat1, RUN.panelIn, [BOUNDARY.w + 60, 0]);
  const opacity = interp(
    chat1,
    [RUN.panelIn[0], RUN.panelIn[1], RUN.panelOut[0], RUN.panelOut[1]],
    [0, 1, 1, 0],
  );
  const active: BoundaryStep | "none" =
    chat1 < RUN.admit
      ? "none"
      : chat1 < RUN.run
        ? "admit"
        : chat1 < RUN.settle
          ? "run"
          : "settle";
  const reached = BOUNDARY_STEPS.indexOf(active as BoundaryStep);
  const money =
    active === "settle"
      ? "charged $0.0131 · 1,842 tokens"
      : active === "none"
        ? "—"
        : "held $0.0400 · worst case";
  return (
    <div
      style={{
        transform: `translateX(${x}px)`,
        opacity,
        left: BOUNDARY.left,
        top: BOUNDARY.top,
        width: BOUNDARY.w,
        height: BOUNDARY.h,
      }}
      className="absolute flex flex-col overflow-hidden rounded-lg border border-foreground/15 bg-background shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]"
    >
      <div className="mono flex items-center justify-between border-b border-border px-3 py-2 text-[10px] text-muted-foreground">
        <span>app/api/chat/route.ts</span>
        <span>the execution boundary</span>
      </div>
      <div className="mono flex-1 overflow-hidden px-3 py-3 text-[11.5px] leading-[1.75]">
        {CODE.map((l, i) => (
          <CodeLine key={i} l={l} active={active} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5 border-t border-border px-3 py-2">
        {BOUNDARY_STEPS.map((step, i) => (
          <div
            key={step}
            className={cn(
              "mono flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[11px] uppercase tracking-[0.06em]",
              i === reached
                ? "border-foreground bg-foreground text-background"
                : i < reached
                  ? "border-border text-foreground"
                  : "border-border text-muted-foreground",
            )}
          >
            {i < reached && <span className="text-success">✓</span>}
            {step}
          </div>
        ))}
      </div>
      <div className="mono space-y-0.5 border-t border-border px-3 py-2.5 text-[10.5px]">
        <div className="text-foreground">{money}</div>
        <div className="text-muted-foreground">{BOUNDARY_NOTE[active]}</div>
      </div>
    </div>
  );
}

function CodeLine({ l, active }: { l: (typeof CODE)[number]; active: string }) {
  const bg = active === l.step ? "var(--muted)" : "transparent";
  const color =
    active === "none" || active === l.step
      ? "var(--foreground)"
      : "var(--muted-foreground)";
  return (
    <div
      style={{ background: bg, color }}
      className="-mx-1 whitespace-pre rounded-sm px-1"
    >
      {l.text || " "}
    </div>
  );
}

/* ---------- customize act overlay: the installed page, as source ---------- */

/** Where in the customize act the saved config hot-reloads the header. */
const RELOAD_AT = 0.75;

const TREE = [
  ["app/[locale]/(app)/chat/page.tsx", false],
  ["components/chat/chat-panel.tsx", false],
  ["components/chat/message.tsx", false],
  ["actions.ts", false],
  ["lib/chat-config.tsx", true],
  ["messages/en/chat.json", false],
] as const;

/**
 * The editor moment — the agent's identity edited in the consumer's own
 * config while the product runs behind it. Opens during the customize
 * act and leaves as the next act (`closesWith`) begins.
 */
function Editor({
  customize,
  closesWith,
}: {
  customize: number;
  closesWith: number;
}) {
  const EW = 430;
  const xIn = interp(customize, [0.02, 0.14], [-EW - 40, 0]);
  const xOut = interp(closesWith, [0, 0.2], [0, -EW - 40]);
  const x = xIn + xOut;
  const opacity = interp(customize, [0.02, 0.1], [0, 1]);
  const name = typed(customize, 0.3, 0.5, "Contract Copilot");
  const oldName = "Assistant".slice(
    0,
    Math.round((1 - seg(customize, 0.22, 0.3)) * 9),
  );
  const iconOp = interp(customize, [0.52, 0.58], [0, 1]);
  const modified = interp(customize, [0.6, 0.64], [0, 1]);
  const saved = customize > RELOAD_AT;
  return (
    <div
      style={{
        transform: `translateX(${x}px)`,
        opacity,
        left: 0,
        top: 20,
        width: EW,
        height: H - 40,
      }}
      className="absolute flex overflow-hidden rounded-lg border border-foreground/15 bg-background shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]"
    >
      <div className="mono w-[150px] shrink-0 border-r border-border bg-muted/60 p-2.5 text-[9px]">
        <div className="mb-2 text-muted-foreground">
          my-app · installed by shadcn add
        </div>
        {TREE.map(([f, hot]) => (
          <div
            key={f}
            className={cn(
              "flex items-center justify-between truncate rounded-sm px-1 py-[3px]",
              hot ? "bg-background text-foreground" : "text-foreground/70",
            )}
          >
            <span className="truncate">{f}</span>
            {hot && (
              <span
                style={{ opacity: modified }}
                className={saved ? "text-success" : "text-foreground"}
              >
                {saved ? "✓" : "M"}
              </span>
            )}
          </div>
        ))}
        <div className="mt-3 border-t border-border pt-2 text-muted-foreground">
          consumer-owned · not a dependency
        </div>
      </div>
      <div className="mono flex-1 p-3 text-[11px] leading-[1.65] text-foreground">
        <div className="mb-2 text-muted-foreground">lib/chat-config.tsx</div>
        <div>
          <span className="text-foreground">export const</span> chatConfig ={" "}
          {"{"}
        </div>
        <div className="pl-3">agent: {"{"}</div>
        <div className="pl-6">
          name:{" "}
          <span className="text-success">
            "<span>{oldName}</span>
            <span>{name}</span>"
          </span>
          ,
        </div>
        <div className="pl-6">
          icon:{" "}
          <span className="text-success" style={{ opacity: iconOp }}>
            "📄"
          </span>
          {iconOp > 0.5 && ","}
        </div>
        <div className="pl-3">{"},"}</div>
        <div className="pl-3">
          starters: [
          <span className="text-success">"Summarise this contract"</span>,{" "}
          <span className="text-success">"Flag renewal risks"</span>],
        </div>
        <div>{"};"}</div>
        <div className="mt-4 text-muted-foreground">
          // components/chat/* — unchanged
        </div>
        <div className="text-muted-foreground">
          // re-install the item later: your config survives
        </div>
      </div>
    </div>
  );
}

/* ---------- the closing card ---------- */

const CREATE_COMMAND = "pnpm dlx @intelligo-dev/cli@beta create my-app";

function Ending({ ending }: { ending: number }) {
  const veil = interp(ending, [0, 0.18], [0, 0.94]);
  const first = interp(ending, [0.08, 0.2], [0, 1]);
  const second = interp(ending, [0.22, 0.34], [0, 1]);
  const rest = interp(ending, [0.38, 0.5], [0, 1]);
  const rise = (v: number) => `translateY(${(1 - v) * 10}px)`;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 pt-12 text-center">
      <div
        style={{ opacity: veil }}
        className="absolute inset-0 rounded-xl bg-background"
      />
      <div className="heading relative text-[42px] font-semibold leading-[1.12] text-foreground">
        <div style={{ opacity: first, transform: rise(first) }}>
          You build the agent.
        </div>
        <div style={{ opacity: second, transform: rise(second) }}>
          Intelligo is everything around it.
        </div>
      </div>
      <div
        style={{ opacity: rest, transform: rise(rest) }}
        className="relative flex flex-col items-center gap-3"
      >
        <div className="mono rounded-lg border border-foreground/15 bg-muted px-4 py-2.5 text-[14px] text-foreground">
          <span className="text-muted-foreground">$ </span>
          {CREATE_COMMAND}
        </div>
        <div className="mono text-[12px] text-muted-foreground">
          intelligo.dev · open source, Apache-2.0 · Mastra, the AI SDK, eve —
          bring your own
        </div>
      </div>
    </div>
  );
}

/* ---------- the application on the stage, across acts ---------- */

function App({
  entrance,
  screen,
  chat1,
  ledger,
  customize,
  ending,
  contentOpacity,
}: {
  entrance: number;
  screen: Screen;
  chat1: number;
  ledger: number;
  customize: number;
  ending: number;
  contentOpacity: number;
}) {
  const opacity = interp(entrance, [0, 0.04], [0, 1]);
  const back = interp(
    chat1,
    [RUN.pullBack[0], RUN.pullBack[1], RUN.restore[0], RUN.restore[1]],
    [0, 1, 1, 0],
  );
  const scale = 1 - (1 - APP_BACK.scale) * back;
  const reloaded = customize > RELOAD_AT;
  const identityRing = interp(
    customize,
    [RELOAD_AT, RELOAD_AT + 0.05, 0.96, 1],
    [0, 1, 1, 0],
  );
  return (
    <div style={{ opacity }} className="absolute inset-0">
      <div
        style={{
          transform: `translate(${APP_BACK.x * back}px, ${APP_BACK.y * back}px) scale(${scale})`,
          transformOrigin: "top left",
        }}
        className="absolute left-0 top-0"
      >
        <Stage
          entrance={entrance}
          screen={screen}
          chatProgress={chat1}
          usageProgress={ledger}
          customized={reloaded}
          identityRing={identityRing}
          contentOpacity={contentOpacity}
        />
      </div>
      <BoundaryPanel chat1={chat1} />
      {ending > 0 && <Ending ending={ending} />}
    </div>
  );
}

/* ---------- fonts (loaded once at module scope; just the weights and
 * subset the film's classNames actually use — 400/500/600, English) --- */

const SANS_FONT = loadGeist("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
}).fontFamily;
const MONO_FONT = loadGeistMono("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
}).fontFamily;
const HEADING_FONT = loadOutfit("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
}).fontFamily;

/* ---------- the composition ---------- */

/** Half-width of the opacity dip around a page swap, on the 0 → 1 track. */
const SWAP_DIP = 0.005;
/** How long a script line takes to arrive or leave, on the 0 → 1 track. */
const LINE_FADE = 0.007;

export type FilmProps = { theme?: "light" | "dark" };

export function Film({ theme = "light" }: FilmProps) {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const p = clamp01(frame / (durationInFrames - 1));

  // Each act's clamped 0 → 1 local progress: past its own window an act
  // holds at 1, so what it built stays built through every later act.
  const hook = interp(p, SCENE.hook, [0, 1]);
  const terminal = interp(p, SCENE.terminal, [0, 1]);
  const blocks = interp(p, SCENE.blocks, [0, 1]);
  const dashboard = interp(p, SCENE.dashboard, [0, 1]);
  const chat1 = interp(p, SCENE.chat1, [0, 1]);
  const ledger = interp(p, SCENE.ledger, [0, 1]);
  const customize = interp(p, SCENE.customize, [0, 1]);
  const ending = interp(p, SCENE.ending, [0, 1]);
  const trayFade = interp(p, TRAY_CLEAR, [1, 0]);

  const screen: Screen =
    customize > 0
      ? "chat"
      : ledger > 0
        ? "usage"
        : chat1 > 0
          ? "chat"
          : "dashboard";
  const contentOpacity = Math.min(
    ...[SCENE.chat1[0], SCENE.ledger[0], SCENE.customize[0]].map((swap) =>
      interp(Math.abs(p - swap), [0, SWAP_DIP], [0, 1]),
    ),
  );

  let beat = 0;
  BEATS.forEach((b, n) => {
    if (p >= b.at) beat = n;
  });
  const { scene, line, label } = BEATS[beat]!;
  const lineStart = BEATS.find((b) => b.line === line)!.at;
  const lineEnd = BEATS.find((b) => b.at > lineStart && b.line !== line)?.at;
  const lineIn = interp(p, [lineStart, lineStart + LINE_FADE], [0, 1]);
  const lineOut =
    lineEnd === undefined
      ? 1
      : interp(p, [lineEnd - LINE_FADE, lineEnd], [1, 0]);
  const labelIn = interp(
    p,
    [BEATS[beat]!.at, BEATS[beat]!.at + LINE_FADE],
    [0, 1],
  );

  const stageW = W * SCALE;
  const stageH = H * SCALE;

  return (
    <FilmProviders>
      <AbsoluteFill
        className={theme === "dark" ? "dark" : undefined}
        style={
          {
            backgroundColor: "var(--background)",
            color: "var(--foreground)",
            fontFamily: "var(--font-sans)",
            "--font-sans": SANS_FONT,
            "--font-mono": MONO_FONT,
            "--font-heading": HEADING_FONT,
          } as CSSProperties
        }
      >
        <div
          style={{
            position: "absolute",
            left: (width - stageW) / 2,
            top: (height - CAPTION_BAND - stageH) / 2,
            width: stageW,
            height: stageH,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              transform: `scale(${SCALE})`,
              transformOrigin: "top left",
            }}
          >
            <div
              className="film-stage relative overflow-hidden rounded-xl"
              style={{ width: W, height: H }}
            >
              <Hook p={hook} />
              <Moments p={blocks} fade={trayFade} />
              <Terminal p={terminal} />
              <App
                entrance={dashboard}
                screen={screen}
                chat1={chat1}
                ledger={ledger}
                customize={customize}
                ending={ending}
                contentOpacity={contentOpacity}
              />
              {/* Painted after App: the app is already up behind this
               * overlay, and DOM order is paint order with no z-index. */}
              <Editor customize={customize} closesWith={ending} />
            </div>
          </div>
        </div>

        {/* The lower third, in the reserved CAPTION_BAND below the stage:
         * the script line a muted viewer reads, the small print under it,
         * and where in the film this is. The closing card carries its own
         * words, so the band empties as that act begins. */}
        {line !== "" && (
          <div
            className="absolute inset-x-16 flex items-end justify-between gap-12"
            style={{ bottom: 26 }}
          >
            <div>
              <div
                style={{
                  opacity: lineIn * lineOut,
                  transform: `translateY(${(1 - lineIn) * 10}px)`,
                }}
                className="heading text-[40px] font-medium leading-[1.15] text-foreground"
              >
                {line}
              </div>
              <div
                style={{ opacity: labelIn * lineOut }}
                className="mono mt-2 text-[17px] text-muted-foreground"
              >
                {label}
              </div>
            </div>
            <div className="mono shrink-0 pb-1 text-right text-[14px] uppercase tracking-[0.08em] text-muted-foreground">
              <div>
                {SCENES[scene]!.n} / {String(SCENES.length).padStart(2, "0")}
              </div>
              <div className="mt-1 text-foreground/80">
                {SCENES[scene]!.title}
              </div>
            </div>
          </div>
        )}
      </AbsoluteFill>
    </FilmProviders>
  );
}
