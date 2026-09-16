---
title: Installing blocks
description: Pages arrive through a shadcn-compatible registry as source you own — installed with the standard shadcn CLI, in dependency order.
order: 0
---

Intelligo's pages are not a runtime UI package. They are **registry blocks**: shadcn-schema items hosted at `https://intelligo.dev/r/<item>.json`, installed with the standard shadcn CLI into your repository. Each brings its routes, components, loading, empty and error states, thin Server Actions, config files and English messages. [/blocks](/blocks) renders every one of them live.

```bash
pnpm dlx shadcn@latest add https://intelligo.dev/r/team-settings.json
```

The app `intelligo create` scaffolds is already registry-ready: shadcn base-nova, Tailwind 4, the `intelligo` design tokens, next-intl routing under `app/[locale]` and the `@/i18n/navigation` helpers the blocks import.

## Install order

Some blocks import files another block ships. Install the dependency first:

| Block | Needs |
| --- | --- |
| everything with pages | `route-error` |
| `auth-signup`, `auth-password-reset`, `auth-email-verification` | `auth-login` |
| `invitation-accept` | `team-settings` |
| `usage`, `billing-settings`, `dashboard`, `feature-gating`, `payment-poll` | `pricing` |
| `chat-panel`, `chat-widget`, `chat-share` | `chat` |

A full install, in an order that satisfies all of it:

```text
route-error app-shell settings-shell
auth-login auth-signup auth-password-reset auth-email-verification onboarding
team-settings invitation-accept workspace-settings profile-settings privacy-settings
pricing checkout billing-settings usage feature-gating payment-poll trial-banner
language-switcher notifications dashboard artifacts
chat chat-panel chat-widget chat-share
```

The machine-readable version is `packages/registry/requires.json` in the framework repository; CI installs in that order on every run, and `intelligo doctor` checks an app against it.

## Feature keys

A block that gates on a feature needs that key in your `lib/plans.ts`. An unregistered feature is denied, so the `chat` block returns 403 on every request until `chat` is granted to a plan. The scaffold grants it to every plan by default.

## Three rules

1. **Installed components are used as-is.** What a deployment varies arrives through the [config files](/docs/registry/config-seams) the blocks ship.
2. **Copy is translation, not code.** Every block reads its strings from its own next-intl namespace; [adding a language](/docs/registry/i18n) means adding message files.
3. **Business rules live behind the pages.** An installed action parses, calls a typed service, maps the error and revalidates. The invariants are in the packages, tested against a real database.

## Taking an update

A block is yours once installed. To take a newer version, commit first and run `shadcn add` for the block again; it asks before overwriting each file that already exists. Components you never edited can be overwritten safely. Your config and message files are where your changes live, so keep yours or merge them from the diff.
