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
import { chatConfig } from "@ui/lib/chat-config";

/**
 * Ported from apps/site/src/components/film.tsx (the homepage's old
 * scroll-driven film), then redesigned twice: first so the sidebar,
 * header, dashboard and chat surfaces are the real registry/reference-app
 * components (see scripts/sync-ui.mjs) instead of a redrawing of them,
 * then so the story itself is richer than "dashboard, one exchange, time
 * passes" — seven acts now: the build, pages assembling, the real
 * dashboard, a first real exchange, customizing the agent mid-story, a
 * second exchange that shows off attachments/tool activity/a human
 * approval gate/cited sources/an artifact, and a closing card. See each
 * act's own comment for what changed and why.
 *
 * Every `useTransform`/`MotionValue` from the original is a plain
 * `interp()` call on a plain number here — `p` was a scroll fraction
 * there, is `frame / durationInFrames` here, and Remotion re-evaluates
 * the whole tree every frame already, so no reactive value graph is
 * needed.
 */

const W = 960;
const H = 600;

/** The stage renders at this scale inside the 1920×1080 composition,
 * filling the frame's height edge to edge with a fixed side margin. */
const SCALE = 1.5;
/** Reserved band at the bottom of the composition for the caption, so it
 * never overlaps the stage's own bottom-anchored content (the tray). */
const CAPTION_BAND = 140;

/**
 * Seven top-level acts on the 0 → 1 track. Each gets its own clamped
 * 0 → 1 local progress (see `Film()`) — components read whichever local
 * value is theirs and naturally freeze at 1 once their own act has
 * passed (interp clamps), which is what lets e.g. the assembled tray,
 * the chat1 exchange, or the customized agent identity just persist
 * into later acts with no extra plumbing.
 */
const SCENE = {
  terminal: [0, 0.12] as [number, number],
  blocks: [0.12, 0.36] as [number, number],
  dashboard: [0.36, 0.44] as [number, number],
  chat1: [0.44, 0.58] as [number, number],
  customize: [0.58, 0.68] as [number, number],
  chat2: [0.68, 0.92] as [number, number],
  ending: [0.92, 1] as [number, number],
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
  {
    id: "terminal",
    n: "01",
    title: "The build begins",
    note: "One command scaffolds the app, installs the framework packages, and pulls in every page as your own source.",
  },
  {
    id: "blocks",
    n: "02",
    title: "Pages assemble",
    note: "Auth, dashboard, chat, settings and billing — installed group by group, exactly as shadcn wrote them.",
  },
  {
    id: "dashboard",
    n: "03",
    title: "Your product",
    note: "One running application, ready to work — your agent lands in the seam it's built for.",
  },
  {
    id: "chat1",
    n: "04",
    title: "Ask it something",
    note: "A message goes in, your agent answers natively — Intelligo admits the run, watches for sources, settles the cost.",
  },
  {
    id: "customize",
    n: "05",
    title: "Make it yours",
    note: "Still your source. Change the agent's identity in lib/chat-config.tsx; the components never move.",
  },
  {
    id: "chat2",
    n: "06",
    title: "Everything it can do",
    note: "Attachments, tool activity, a human approval gate, cited sources — then the answer becomes a document.",
  },
  {
    id: "ending",
    n: "07",
    title: "Now build yours",
    note: "eve, Mastra, the AI SDK — whatever you bring, it lands in the same seam.",
  },
] as const;

type Step = { scene: number; label: string; at: number };
const g = (win: [number, number], f: number) => win[0] + f * (win[1] - win[0]);

const STEPS: Step[] = [
  { scene: 0, label: "intelligo create", at: g(SCENE.terminal, 0) },
  { scene: 0, label: "Packages installed", at: g(SCENE.terminal, 0.4) },
  {
    scene: 0,
    label: "Registry items installed",
    at: g(SCENE.terminal, 0.72),
  },
  ...MOMENTS.map((m, k) => ({
    scene: 1,
    label: `${m.title} created`,
    at: g(SCENE.blocks, momentWindow(k)[0]),
  })),
  { scene: 2, label: "Your product is running", at: g(SCENE.dashboard, 0) },
  { scene: 2, label: "Your agent lands", at: g(SCENE.dashboard, 0.7) },
  { scene: 3, label: "A message is typed", at: g(SCENE.chat1, 0) },
  {
    scene: 3,
    label: "Admit — entitlement checked, credits reserved",
    at: g(SCENE.chat1, 0.15),
  },
  { scene: 3, label: "Run — your agent, unmodified", at: g(SCENE.chat1, 0.35) },
  {
    scene: 3,
    label: "Settle — usage recorded, credits charged",
    at: g(SCENE.chat1, 0.6),
  },
  { scene: 4, label: "Open lib/chat-config.tsx", at: g(SCENE.customize, 0) },
  {
    scene: 4,
    label: "Edit the agent's identity",
    at: g(SCENE.customize, 0.4),
  },
  {
    scene: 4,
    label: "Hot reload — components untouched",
    at: g(SCENE.customize, 0.75),
  },
  {
    scene: 5,
    label: "A new question, with an attachment",
    at: g(SCENE.chat2, 0),
  },
  { scene: 5, label: "Searching the contract", at: g(SCENE.chat2, 0.13) },
  { scene: 5, label: "Waiting on your approval", at: g(SCENE.chat2, 0.34) },
  { scene: 5, label: "Approved — the send goes out", at: g(SCENE.chat2, 0.7) },
  { scene: 5, label: "Saved as an artifact", at: g(SCENE.chat2, 0.93) },
  { scene: 6, label: "Add your own feature", at: g(SCENE.ending, 0.1) },
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

/* ---------- act 0: the terminal ---------- */

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

/* ---- chat1: a first, simple exchange — thinking, one cited source ---- */

const ASK1 = "Which clauses expose us at renewal?";
const ANSWER1 =
  "Two: the auto-renewal in §4.2 (90-day notice, already inside the window) and the price-escalator in §7 with no cap [1]. Recommend serving notice this week.";

function chat1Messages(r: number): UIMessage[] {
  const messages: UIMessage[] = [
    { id: "c1-u1", role: "user", parts: [{ type: "text", text: ASK1 }] },
  ];
  if (r > 0.05) {
    // Fixture parts reach past the AI SDK's public UIMessage union for a
    // couple of experimental fields (source-url) message.tsx already
    // reads structurally — see lib/message-parts.ts's own `sourcesOf`.
    const parts: unknown[] = [];
    if (r > 0.5) {
      parts.push({
        type: "source-url",
        sourceId: "c1-src-1",
        url: "https://acme.internal/contracts/q3-vendor.pdf",
        title: "Q3 Vendor Agreement · §7",
      });
    }
    parts.push({ type: "text", text: typed(r, 0.12, 0.55, ANSWER1) });
    messages.push({
      id: "c1-a1",
      role: "assistant",
      parts: parts as UIMessage["parts"],
    });
  }
  return messages;
}

/* ---- chat2: the feature showcase — attachment, tool activity, a human
 * approval gate, sources, and the answer becomes an artifact ---- */

const ASK2 =
  "Draft a renewal notice and check whether legal needs to sign off first.";
const ANSWER2 =
  "Found the escalator clause and confirmed legal review is required over $50k [1]. Drafted the notice — approved below, so it's on its way.";

/** A small inline placeholder — a scanned-clause look — so the fixture
 * needs no network access during a render. */
const CLAUSE_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#e2e2e2"/><rect x="16" y="16" width="180" height="10" fill="#9a9a9a"/><rect x="16" y="36" width="208" height="8" fill="#b8b8b8"/><rect x="16" y="52" width="190" height="8" fill="#b8b8b8"/><rect x="16" y="68" width="150" height="8" fill="#b8b8b8"/><rect x="16" y="96" width="208" height="8" fill="#b8b8b8"/><rect x="16" y="112" width="130" height="8" fill="#b8b8b8"/></svg>',
)}`;

function chat2Messages(r: number): UIMessage[] {
  const userParts: unknown[] = [
    { type: "text", text: ASK2 },
    {
      type: "file",
      url: CLAUSE_IMAGE,
      mediaType: "image/svg+xml",
      filename: "clause-4.2-screenshot.png",
    },
  ];
  const messages: UIMessage[] = [
    { id: "c2-u1", role: "user", parts: userParts as UIMessage["parts"] },
  ];
  if (r <= 0.05) return messages;

  const parts: unknown[] = [];

  if (r > 0.1) {
    parts.push({
      type: "tool-searchContract",
      toolCallId: "call-search",
      state: r > 0.18 ? "output-available" : "input-available",
      input: { query: "escalator clause legal review threshold" },
      output:
        r > 0.18
          ? {
              sources: [
                {
                  url: "https://acme.internal/contracts/q3-vendor.pdf",
                  title: "Q3 Vendor Agreement · §7",
                  index: 1,
                },
              ],
            }
          : undefined,
    });
  }

  if (r > 0.32) {
    const approved = r > 0.72;
    parts.push({
      type: "tool-sendRenewalNotice",
      toolCallId: "call-send",
      state: approved ? "output-available" : "approval-requested",
      input: { to: "legal@acme.com", subject: "Renewal notice — §4.2" },
      ...(approved
        ? { output: { sent: true } }
        : { approval: { id: "appr-1" } }),
    });
  }

  if (r > 0.76) {
    parts.push({ type: "text", text: typed(r, 0.76, 0.93, ANSWER2) });
  }

  if (r > 0.94) {
    parts.push({
      type: "tool-saveArtifact",
      toolCallId: "call-save",
      state: "output-available",
      input: { title: "Renewal Notice — §4.2", kind: "text" },
      output: { id: "doc-1", title: "Renewal Notice — §4.2", kind: "text" },
    });
  }

  messages.push({
    id: "c2-a1",
    role: "assistant",
    parts: parts as UIMessage["parts"],
  });
  return messages;
}

type Screen = "dashboard" | "chat1" | "chat2";

function ChatScreen({ screen, r }: { screen: "chat1" | "chat2"; r: number }) {
  const messages = screen === "chat1" ? chat1Messages(r) : chat2Messages(r);
  const isStreaming =
    screen === "chat1" ? r > 0.05 && r < 0.56 : r > 0.05 && r < 0.95;
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
        value=""
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
  customized,
}: {
  entrance: number;
  screen: Screen;
  chatProgress: number;
  customized: boolean;
}) {
  const pathname = screen === "dashboard" ? "/dashboard" : "/chat/conv_1";
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
           * the agent identity — "Assistant" until the customize act
           * lands, then whatever `ui-overrides/lib/chat-config.tsx`
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
                {screen !== "dashboard" && (
                  <span className="mr-1 flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    {agentIcon && <span aria-hidden>{agentIcon}</span>}
                    <span className="max-w-32 truncate">{agentName}</span>
                  </span>
                )}
              </ShellHeader>
              <div className="min-h-0 flex-1 overflow-hidden">
                {screen === "dashboard" ? (
                  <DashboardScreen />
                ) : (
                  <ChatScreen screen={screen} r={chatProgress} />
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

/** A floating explainer, not a layout column — the real chat page has no
 * side panel to put this in, and it's explaining the framework boundary
 * underneath the page, not something any screen shows. Scoped to chat1
 * only — chat2 is already dense with real UI, a second explainer on top
 * of it would be too much at once. */
const BOUNDARY = { w: 268, h: 196, top: 168 };

function BoundaryPanel({ chat1 }: { chat1: number }) {
  const x = interp(chat1, [0.04, 0.14], [BOUNDARY.w + 40, 0]);
  const opacity = interp(chat1, [0.04, 0.12, 0.94, 1], [0, 1, 1, 0]);
  const active =
    chat1 < 0.2
      ? "none"
      : chat1 < 0.42
        ? "admit"
        : chat1 < 0.68
          ? "run"
          : "settle";
  const note =
    active === "admit"
      ? "ADMIT · plan checked through a port, worst-case cost held"
      : active === "run"
        ? "RUN · no wrapper, no agent API — the handle knows nothing about messages"
        : active === "settle"
          ? "SETTLE · tokens and cost recorded, idempotent — no double billing"
          : "waiting for a message";
  return (
    <div
      style={{
        transform: `translateX(${x}px)`,
        opacity,
        left: W - BOUNDARY.w - 20,
        top: BOUNDARY.top,
        width: BOUNDARY.w,
        height: BOUNDARY.h,
      }}
      className="absolute flex flex-col overflow-hidden rounded-md border border-foreground/15 bg-background shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]"
    >
      <div className="mono flex items-center justify-between border-b border-border px-2.5 py-1.5 text-[9px] text-muted-foreground">
        <span>app/api/chat/route.ts</span>
        <span>the execution boundary</span>
      </div>
      <div className="mono flex-1 overflow-hidden p-2.5 text-[9px] leading-[1.6]">
        {CODE.map((l, i) => (
          <CodeLine key={i} l={l} active={active} />
        ))}
      </div>
      <div className="mono border-t border-border px-2.5 py-1.5 text-[8.5px] text-muted-foreground">
        <span>{note}</span>
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

const TREE = [
  ["app/[locale]/(app)/chat/page.tsx", false],
  ["components/chat/chat-panel.tsx", false],
  ["components/chat/message.tsx", false],
  ["actions.ts", false],
  ["lib/chat-config.tsx", true],
  ["messages/en/chat.json", false],
] as const;

/**
 * The VS Code-like moment — editing the agent's identity mid-story, not
 * before the product ever appears. Opens during the customize act,
 * closes as `chat2` begins (`closesWith` — the next act after
 * customize, so the naming stays honest about what's driving it).
 */
function Editor({
  customize,
  closesWith,
}: {
  customize: number;
  closesWith: number;
}) {
  const EW = 390;
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
              <span style={{ opacity: modified }} className="text-foreground">
                M
              </span>
            )}
          </div>
        ))}
        <div className="mt-3 border-t border-border pt-2 text-muted-foreground">
          consumer-owned · not a dependency
        </div>
      </div>
      <div className="mono flex-1 p-3 text-[10px] leading-[1.65] text-foreground">
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

const ENDING_BOX = { w: 520, h: 210 };

function Ending({ ending }: { ending: number }) {
  const opacity = interp(ending, [0.06, 0.24], [0, 1]);
  const scale = interp(ending, [0.06, 0.24], [0.96, 1]);
  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        left: (W - ENDING_BOX.w) / 2,
        top: (H - ENDING_BOX.h) / 2,
        width: ENDING_BOX.w,
        height: ENDING_BOX.h,
      }}
      className="absolute flex flex-col items-center justify-center gap-3 rounded-xl border border-foreground/15 bg-background px-10 text-center shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]"
    >
      <span className="mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        eve · Mastra · the AI SDK
      </span>
      <div className="heading text-[26px] font-semibold text-foreground">
        Now add your own feature
      </div>
      <p className="max-w-sm text-[12.5px] text-muted-foreground">
        Every part above is on npm or in the registry. Bring your own agent into
        the one seam it's built for — upgrades never touch what you've
        customized.
      </p>
    </div>
  );
}

/* ---------- the application on the stage, across acts ---------- */

function App({
  entrance,
  screen,
  chat1,
  chat2,
  ending,
}: {
  entrance: number;
  screen: Screen;
  chat1: number;
  chat2: number;
  ending: number;
}) {
  const opacity = interp(entrance, [0, 0.04], [0, 1]);
  const chatProgress = screen === "chat2" ? chat2 : chat1;
  const customized = chat2 > 0;
  return (
    <div style={{ opacity }} className="absolute inset-0">
      <Stage
        entrance={entrance}
        screen={screen}
        chatProgress={chatProgress}
        customized={customized}
      />
      <BoundaryPanel chat1={chat1} />
      <Ending ending={ending} />
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

export type FilmProps = { theme?: "light" | "dark" };

export function Film({ theme = "light" }: FilmProps) {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const p = clamp01(frame / (durationInFrames - 1));

  // seven acts, each a clamped 0 → 1 local progress — once `p` moves
  // past an act's own window, `interp` clamps it at 1, so anything
  // driven by an earlier act (the parked tray, the customized agent
  // identity) just holds its end state through every later act with no
  // extra plumbing.
  const terminal = interp(p, SCENE.terminal, [0, 1]);
  const blocks = interp(p, SCENE.blocks, [0, 1]);
  const dashboard = interp(p, SCENE.dashboard, [0, 1]);
  const chat1 = interp(p, SCENE.chat1, [0, 1]);
  const customize = interp(p, SCENE.customize, [0, 1]);
  const chat2 = interp(p, SCENE.chat2, [0, 1]);
  const ending = interp(p, SCENE.ending, [0, 1]);
  const trayFade = interp(p, TRAY_CLEAR, [1, 0]);

  const screen: Screen =
    chat2 > 0 ? "chat2" : chat1 > 0 ? "chat1" : "dashboard";

  let step = 0;
  STEPS.forEach((s, n) => {
    if (p >= s.at) step = n;
  });
  const scene = STEPS[step]!.scene;
  const pct = Math.round(p * 100);

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
              <Moments p={blocks} fade={trayFade} />
              <Terminal p={terminal} />
              <App
                entrance={dashboard}
                screen={screen}
                chat1={chat1}
                chat2={chat2}
                ending={ending}
              />
              {/* Editor paints after App now — unlike the old timeline
               * (customize fully before the product ever appeared, so the
               * app was invisible while Editor was on screen), the app is
               * already up and opaque behind this overlay, and DOM order
               * is paint order with no z-index in play. */}
              <Editor customize={customize} closesWith={chat2} />
            </div>
          </div>
        </div>

        {/* lower-third: the same scene/step context the site's Rail gives a scroller.
         * Lives in the reserved CAPTION_BAND strip below the stage, never over it. */}
        <div
          className="mono absolute left-16 text-foreground"
          style={{
            bottom: (CAPTION_BAND - 92) / 2,
            textShadow: "0 1px 12px var(--background)",
          }}
        >
          <div className="text-[13px] uppercase tracking-[0.08em] text-muted-foreground">
            scene {SCENES[scene]!.n} / 07 · {pct}%
          </div>
          <div className="heading mt-1 text-[22px] font-medium text-foreground">
            {SCENES[scene]!.title}
          </div>
          <div className="mt-1 text-[14px] text-foreground/80">
            {STEPS[step]!.label}
          </div>
        </div>
      </AbsoluteFill>
    </FilmProviders>
  );
}
