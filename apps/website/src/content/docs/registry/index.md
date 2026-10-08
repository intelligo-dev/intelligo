---
title: Installing blocks
description: Pages arrive through a shadcn-compatible registry as source you own — installed with the standard shadcn CLI, in dependency order.
order: 0
---

Intelligo's pages are not a runtime UI package. They are **registry blocks**: shadcn-schema items hosted at `https://intelligo.dev/r/<item>.json`, installed with the standard shadcn CLI into your repository. Each brings its routes, components, loading, empty and error states, thin Server Actions, config files and English messages. [/blocks](/blocks) renders every one of them live.

```bash
pnpm exec shadcn add @intelligo/team-settings
```

The app `intelligo create` scaffolds is already registry-ready: shadcn base-nova, Tailwind 4, next-intl routing under `app/[locale]`, the `@/i18n/navigation` helpers the blocks import, and a `components.json` that names the hosted registry `@intelligo`. `create` also installs the `intelligo` base item — the design tokens, fonts and base-nova config every block is drawn with — before any block. Installing into an app it did not make, add that registry entry and run `pnpm exec shadcn add @intelligo/intelligo` first.

## Which release you install

`https://intelligo.dev/r/<item>.json`, the address `@intelligo` names, serves the items of the latest release on npm. Every release's items also stay at `https://intelligo.dev/r/<version>/<item>.json`, and a block installed from there takes the components it builds on from the same release. An app whose `@intelligo-dev/*` packages are older than the latest release installs from its own: `pnpm exec shadcn add https://intelligo.dev/r/<version>/team-settings.json`, with the version its `package.json` names.

`intelligo sync` installs from the registry bundled with the CLI, which is always its own release's.

## Install order

Some blocks import files another block ships, so install the dependency first — `route-error` before any page, `auth-login` before the other auth flows, `pricing` before the commerce blocks, `chat` before the other chat surfaces. [Install order](/docs/registry/install-order) is the full list with the scaffold files and feature keys each block needs, generated from `packages/registry/requires.json` — the same file CI installs from and `intelligo doctor` checks against.

A block that gates on a feature needs that key granted to a plan in `lib/plans.ts`; an unregistered feature is denied, so `chat` returns 403 until `chat` is granted. The scaffold grants it to every plan.

## Three rules

1. **Installed components are used as-is.** What a deployment varies arrives through the [config files](/docs/registry/config-seams) the blocks ship.
2. **Copy is translation, not code.** Every block reads its strings from its own next-intl namespace; [adding a language](/docs/registry/i18n) means adding message files.
3. **Business rules live behind the pages.** An installed action parses, calls a typed service, maps the error and revalidates. The invariants are in the packages, tested against a real database.

## Taking an update

A block is yours once installed. To take a newer version, upgrade the `@intelligo-dev/*` packages to the release it comes from, commit, and run `shadcn add` for the block again; it asks before overwriting each file that already exists. Components you never edited can be overwritten safely. Your config and message files are where your changes live, so keep yours or merge them from the diff.
