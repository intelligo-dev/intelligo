---
title: Config seams
description: Everything a deployment varies — navigation, banners, onboarding, credit bundles, the chat's identity and tools — lives in config files the blocks ship for you to edit.
order: 1
---

Installed components stay verbatim. The files below are the ones you are meant to change; each block page on [/blocks](/blocks) lists the seams it ships under **yours to edit**.

## Shell

**`lib/nav-config.ts`** (`app-shell`) — the sidebar entries. Each has a `titleKey` into the `app-shell` messages, an `href` and a lucide icon. Delete rows for routes you didn't install.

**`lib/shell-config.tsx`** (`app-shell`) — three component slots, all optional:

```tsx
export const shellConfig: ShellConfig = {
  bannerTop: TrialBannerContainer, // above the page content
  headerRight: HeaderExtras,       // right end of the header
  sidebarContent: ChatHistory,     // under the navigation
};
```

Slots take no props. To put several things in one, compose them in a small component of your own:

```tsx
// components/shell/header-extras.tsx
export function HeaderExtras() {
  return (
    <>
      <LanguageSwitcher />
      <NotificationBell />
    </>
  );
}
```

**`lib/workspace-bootstrap.ts`** (`app-shell`) — `onWorkspaceCreated`, for the product rows a new workspace needs.

## Onboarding

**`lib/onboarding-steps.ts`** (`onboarding`) — the steps, their fields (`text` or `select-cards`) and what completion does with the answers.

## Commerce

**`lib/billing-config.ts`** (`pricing`) — `PRODUCT_SLUG`, the display `CURRENCY` and the `CREDIT_BUNDLES` a workspace can buy. The currency here only formats amounts; conversion happens on the billing settings row your composition root seeds.

**`lib/trial-banner-config.ts`**, **`lib/feature-gating-config.ts`**, **`lib/payment-poll-config.ts`** — thresholds, upgrade targets and polling behaviour for their blocks.

## Dashboard and artifacts

**`lib/dashboard-config.tsx`** (`dashboard`) — what the home page composes.

**`lib/document-patterns.ts`** (`artifacts`) — title patterns that label documents and file them under the Reports tab. Call `registerDefaultDocumentPatterns()` once from your composition root.

## Chat

**`lib/chat-config.tsx`** (`chat`) — the client side of the conversation:

```tsx
export const chatConfig: ChatConfig = {
  agent: { name: "Support" },
  starters: ["starters.billing", "starters.export"],
  attachments: { /* what the composer accepts */ },
  activity: "timeline",
  commands: [/* slash commands */],
};
```

**`lib/chat-server-config.ts`** (`chat`) — the server side: model, prompt, tools, windowing, attachments, title, telemetry. See [Bring your agent](/docs/guides/bring-your-agent).

**`lib/chat-renderers.tsx`** (`chat`) — how each tool call and data part renders. See [Tool renderers](/docs/registry/tool-renderers).

**`lib/chat-canvas-config.tsx`** (`chat`) — the document kinds the side canvas can open, with their toolbars and actions.

**`lib/chat-widget-config.tsx`** (`chat-widget`) — the embeddable widget's launcher and panel.

## When a seam is missing

If a product needs something no seam offers, don't edit the installed component — that forks you from every later improvement. The better change is a new seam in the registry, where every product gets it.
