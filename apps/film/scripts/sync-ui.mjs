#!/usr/bin/env node
/**
 * A one-time snapshot of the real shell chrome, dashboard and chat
 * surface the Stage renders with — not a live dependency. Copied
 * straight from the framework's own source (the registry, and the
 * reference app's installed shadcn primitives), the same rewrites
 * apps/site/scripts/sync-framework.mjs uses to run registry components
 * outside Next.js: `@/` → `@ui/`, `next-intl` → `use-intl`,
 * `@intelligo-dev/auth/client` → a shim, server-only files dropped
 * entirely (the same `SERVER_MARKERS` check, ported verbatim — it's
 * what keeps `actions/chat.ts`, `lib/chat-server-config.ts` and
 * `lib/chat-model.ts` out, and with them the reference app's real
 * composition root `lib/intelligo.ts`, which only `chat-server-config.ts`
 * ever reaches). Plus one Stage-specific patch: AppSidebar hardcodes
 * `collapsible="icon"`, and a fixed non-interactive canvas wants
 * `collapsible="none"` (the primitive supports it; the wrapper just
 * doesn't expose it as a prop) — the "always expanded" fit for the
 * wrapper's `min-h-svh` chain lives in src/index.css instead
 * (`.film-stage [data-slot=...]`), reusing the exact technique
 * apps/site/src/styles/global.css already applies for its own
 * ScaledCanvas previews.
 *
 * The file list below is the traced import closure from six roots
 * (AppSidebar, ShellHeader, DashboardHero, PromptBar, MessageList,
 * ChatInput) — not every file `chat`/`dashboard`/`app-shell` ship.
 * Notably excluded: the artifact canvas (`chat-workspace.tsx`,
 * `chat-canvas.tsx`, `canvas/*.tsx`, and their CodeMirror/ProseMirror/
 * react-data-grid dependencies) — nothing in this film ever opens an
 * artifact tool result, but `lib/chat-canvas-config.tsx` still *types*
 * three lazy imports into that canvas, so `src/ui-overrides/components/chat/canvas/*`
 * carries three one-line stubs at those exact paths. `lib/chat-config.tsx`
 * is excluded too, on purpose — see `src/ui-overrides/lib/chat-config.tsx`.
 *
 * Re-run by hand when the registry changes:
 *   pnpm --filter film sync-ui
 *
 * src/ui-overrides/** (hand-written, framework-free stand-ins, plus the
 * canvas stubs and the film's own chat-config identity) is copied last
 * and wins.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FILM = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// apps/film lives inside the framework repository: two directories up.
const FRAMEWORK = resolve(FILM, "../..");
const UI_ROOT = join(FILM, "src/ui");

const SERVER_MARKERS = [
  '"server-only"',
  "next-intl/server",
  "next/headers",
  "next/cache",
  '"use server"',
];

// [source relative to FRAMEWORK, target relative to src/ui]
const FILES = [
  // ---- app-shell: sidebar, header, the two dropdowns they open ----
  [
    "packages/registry/base/app-shell/components/app-sidebar.tsx",
    "components/shell/app-sidebar.tsx",
  ],
  [
    "packages/registry/base/app-shell/components/shell-header.tsx",
    "components/shell/shell-header.tsx",
  ],
  [
    "packages/registry/base/app-shell/components/user-menu.tsx",
    "components/shell/user-menu.tsx",
  ],
  [
    "packages/registry/base/app-shell/components/workspace-switcher.tsx",
    "components/shell/workspace-switcher.tsx",
  ],
  ["packages/registry/base/app-shell/lib/nav-config.ts", "lib/nav-config.ts"],
  [
    "packages/registry/base/app-shell/messages/en.json",
    "messages/en/app-shell.json",
  ],

  // ---- dashboard: the real /dashboard page's two components ----
  [
    "packages/registry/base/dashboard/components/dashboard-hero.tsx",
    "components/dashboard/dashboard-hero.tsx",
  ],
  [
    "packages/registry/base/dashboard/components/prompt-bar.tsx",
    "components/dashboard/prompt-bar.tsx",
  ],
  [
    "packages/registry/base/dashboard/lib/dashboard-config.tsx",
    "lib/dashboard-config.tsx",
  ],
  ["packages/registry/base/dashboard/lib/dashboard-data.ts", "lib/dashboard-data.ts"],
  [
    "packages/registry/base/dashboard/messages/en.json",
    "messages/en/dashboard.json",
  ],

  // ---- chat: the real /chat page's message list + composer ----
  // (chat-config.tsx deliberately excluded — src/ui-overrides carries
  // this film's own agent identity instead of the registry's empty
  // scaffold default; actions.ts/chat-server-config.ts/chat-model.ts
  // are server-only and get dropped by the SERVER_MARKERS check below)
  [
    "packages/registry/base/chat/components/message-list.tsx",
    "components/chat/message-list.tsx",
  ],
  [
    "packages/registry/base/chat/components/chat-input.tsx",
    "components/chat/chat-input.tsx",
  ],
  ["packages/registry/base/chat/components/message.tsx", "components/chat/message.tsx"],
  [
    "packages/registry/base/chat/components/message-actions.tsx",
    "components/chat/message-actions.tsx",
  ],
  [
    "packages/registry/base/chat/components/tool-activity.tsx",
    "components/chat/tool-activity.tsx",
  ],
  [
    "packages/registry/base/chat/components/agent-activity.tsx",
    "components/chat/agent-activity.tsx",
  ],
  [
    "packages/registry/base/chat/components/artifact-card.tsx",
    "components/chat/artifact-card.tsx",
  ],
  [
    "packages/registry/base/chat/components/data-parts.tsx",
    "components/chat/data-parts.tsx",
  ],
  ["packages/registry/base/chat/actions.ts", "actions/chat.ts"],
  [
    "packages/registry/base/chat/hooks/use-composer-menu.ts",
    "hooks/use-composer-menu.ts",
  ],
  [
    "packages/registry/base/chat/lib/chat-canvas-config.tsx",
    "lib/chat-canvas-config.tsx",
  ],
  ["packages/registry/base/chat/lib/chat-renderers.tsx", "lib/chat-renderers.tsx"],
  ["packages/registry/base/chat/lib/chat-server-config.ts", "lib/chat-server-config.ts"],
  ["packages/registry/base/chat/lib/chat-model.ts", "lib/chat-model.ts"],
  ["packages/registry/base/chat/lib/chat-models.ts", "lib/chat-models.ts"],
  ["packages/registry/base/chat/lib/message-parts.ts", "lib/message-parts.ts"],
  ["packages/registry/base/chat/messages/en.json", "messages/en/chat.json"],

  // ---- T3: every AI part the closure above actually reaches ----
  [
    "packages/registry/base/ui/ai-message/ai-message.tsx",
    "components/ui/ai-message.tsx",
  ],
  [
    "packages/registry/base/ui/ai-message-bubble/ai-message-bubble.tsx",
    "components/ui/ai-message-bubble.tsx",
  ],
  [
    "packages/registry/base/ui/ai-motion/ai-motion.tsx",
    "components/ui/ai-motion.tsx",
  ],
  [
    "packages/registry/base/ui/ai-prompt-input/ai-prompt-input.tsx",
    "components/ui/ai-prompt-input.tsx",
  ],
  [
    "packages/registry/base/ui/ai-speech-input/ai-speech-input.tsx",
    "components/ui/ai-speech-input.tsx",
  ],
  [
    "packages/registry/base/ui/ai-composer-menu/ai-composer-menu.tsx",
    "components/ui/ai-composer-menu.tsx",
  ],
  [
    "packages/registry/base/ui/ai-message-scroller/ai-message-scroller.tsx",
    "components/ui/ai-message-scroller.tsx",
  ],
  [
    "packages/registry/base/ui/ai-shimmer-text/ai-shimmer-text.tsx",
    "components/ui/ai-shimmer-text.tsx",
  ],
  [
    "packages/registry/base/ui/ai-agent-activity/ai-agent-activity.tsx",
    "components/ui/ai-agent-activity.tsx",
  ],
  [
    "packages/registry/base/ui/ai-tool-result/ai-tool-result.tsx",
    "components/ui/ai-tool-result.tsx",
  ],
  [
    "packages/registry/base/ui/ai-tool-approval/ai-tool-approval.tsx",
    "components/ui/ai-tool-approval.tsx",
  ],
  [
    "packages/registry/base/ui/ai-approval-card/ai-approval-card.tsx",
    "components/ui/ai-approval-card.tsx",
  ],
  ["packages/registry/base/ui/ai-branch/ai-branch.tsx", "components/ui/ai-branch.tsx"],
  [
    "packages/registry/base/ui/ai-citations/ai-citations.tsx",
    "components/ui/ai-citations.tsx",
  ],
  [
    "packages/registry/base/ui/ai-code-block/ai-code-block.tsx",
    "components/ui/ai-code-block.tsx",
  ],
  [
    "packages/registry/base/ui/ai-reasoning/ai-reasoning.tsx",
    "components/ui/ai-reasoning.tsx",
  ],
  [
    "packages/registry/base/ui/ai-todo-list/ai-todo-list.tsx",
    "components/ui/ai-todo-list.tsx",
  ],
  [
    "packages/registry/base/ui/status-badge/status-badge.tsx",
    "components/ui/status-badge.tsx",
  ],
  [
    "packages/registry/base/ui/copy-button/copy-button.tsx",
    "components/ui/copy-button.tsx",
  ],
  [
    "packages/registry/base/ui/document-viewer/document-viewer.tsx",
    "components/ui/document-viewer.tsx",
  ],

  // ---- shadcn primitives (T1/T2), from the reference app — the same
  // files `shadcn add` would install for a consumer ----
  ["apps/app/components/ui/attachment.tsx", "components/ui/attachment.tsx"],
  ["apps/app/components/ui/avatar.tsx", "components/ui/avatar.tsx"],
  ["apps/app/components/ui/button.tsx", "components/ui/button.tsx"],
  ["apps/app/components/ui/checkbox.tsx", "components/ui/checkbox.tsx"],
  ["apps/app/components/ui/collapsible.tsx", "components/ui/collapsible.tsx"],
  ["apps/app/components/ui/command.tsx", "components/ui/command.tsx"],
  ["apps/app/components/ui/dialog.tsx", "components/ui/dialog.tsx"],
  [
    "apps/app/components/ui/dropdown-menu.tsx",
    "components/ui/dropdown-menu.tsx",
  ],
  ["apps/app/components/ui/hover-card.tsx", "components/ui/hover-card.tsx"],
  ["apps/app/components/ui/input.tsx", "components/ui/input.tsx"],
  ["apps/app/components/ui/input-group.tsx", "components/ui/input-group.tsx"],
  ["apps/app/components/ui/item.tsx", "components/ui/item.tsx"],
  ["apps/app/components/ui/radio-group.tsx", "components/ui/radio-group.tsx"],
  ["apps/app/components/ui/select.tsx", "components/ui/select.tsx"],
  ["apps/app/components/ui/separator.tsx", "components/ui/separator.tsx"],
  ["apps/app/components/ui/sheet.tsx", "components/ui/sheet.tsx"],
  ["apps/app/components/ui/sidebar.tsx", "components/ui/sidebar.tsx"],
  ["apps/app/components/ui/skeleton.tsx", "components/ui/skeleton.tsx"],
  ["apps/app/components/ui/spinner.tsx", "components/ui/spinner.tsx"],
  ["apps/app/components/ui/textarea.tsx", "components/ui/textarea.tsx"],
  ["apps/app/components/ui/tooltip.tsx", "components/ui/tooltip.tsx"],
  ["apps/app/hooks/use-mobile.ts", "hooks/use-mobile.ts"],
  ["apps/app/lib/utils.ts", "lib/utils.ts"],
];

function rewrite(source) {
  return source
    .replace(/from "@\//g, 'from "@ui/')
    .replace(/import\("@\//g, 'import("@ui/')
    .replace(/from "next-intl"/g, 'from "use-intl"')
    .replace(
      /from "@intelligo-dev\/auth\/client"/g,
      'from "@ui/shims/auth-client"'
    )
    // AppSidebar hardcodes the icon-collapse variant; a fixed canvas with
    // no viewport to collapse against wants the non-collapsing one.
    .replace(/<Sidebar collapsible="icon">/, '<Sidebar collapsible="none">');
}

let copied = 0;
let skipped = 0;
for (const [rel, target] of FILES) {
  const source = join(FRAMEWORK, rel);
  const raw = readFileSync(source, "utf8");
  if (
    /\.(ts|tsx)$/.test(target) &&
    SERVER_MARKERS.some((marker) => raw.includes(marker))
  ) {
    skipped++;
    continue;
  }
  const dest = join(UI_ROOT, target);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, /\.(ts|tsx)$/.test(target) ? rewrite(raw) : raw);
  copied++;
}

const overrides = join(FILM, "src/ui-overrides");
if (existsSync(overrides)) cpSync(overrides, UI_ROOT, { recursive: true });

console.log(
  `sync-ui: ${copied} files from the registry + reference app into src/ui (${skipped} server-only skipped)`
);
