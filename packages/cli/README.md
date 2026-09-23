# @intelligo-dev/cli

The Intelligo CLI: scaffold an AI SaaS app, generate owned source, and check its migrations and upgrades.

Part of [Intelligo](https://intelligo.dev), an application framework and
operational platform for vertical AI SaaS products. Every `@intelligo-dev/*`
package is released at one version and shares one database schema;
`pnpm dlx @intelligo-dev/cli@beta create my-app` installs the set an
application needs. Documentation:
[intelligo.dev/docs/packages/cli](https://intelligo.dev/docs/packages/cli).

## Install

```bash
pnpm add -D @intelligo-dev/cli@beta
```

`create` needs no install — run it with `pnpm dlx`. The scaffold adds the CLI
to the new application, which is where `intelligo` comes from afterwards.

## Commands

```bash
pnpm dlx @intelligo-dev/cli@beta create my-app   # a registry-ready Next.js app, plus the pages you pick
pnpm dlx @intelligo-dev/cli@beta create my-app --items chat,billing-settings --yes   # no questions
intelligo add <feature>                # generate consumer-owned source (admin-page, maintenance)
intelligo doctor                       # what is misconfigured, and why it matters
intelligo migrate                      # apply the framework chain
intelligo migrate --check [--json]     # compare the chain with the database, change nothing
intelligo upgrade --check              # what a template upgrade would change
intelligo sync [items…]                # install registry pages from this release, seams kept
intelligo sync --check                 # exit 1 when an installed page drifted from the registry
```

## `sync`: installed pages stay the registry's

A page arrives as source, through `shadcn add`, and nothing stops it drifting
afterwards — an edit here, a release skipped there. `intelligo sync` installs
items from the registry bundled with this CLI, so the pages match the
`@intelligo-dev/*` packages of the same version, in dependency order. Files an
item ships once for you to own (`lib/*-config`, `lib/nav-config.ts`… — the
`seams` in the registry's `requires.json`) are put back after the install, and
message files are merged key by key with your copy winning. The result is
recorded in `intelligo.manifest.json`.

Name the items once — `intelligo sync intelligo app-shell chat …` — and
afterwards a bare `intelligo sync` updates them. It refuses to overwrite a file
you edited by hand unless you pass `--force`: move the change into a seam
first. `intelligo sync --check` installs nothing, lists every file that is
`missing`, `edited`, `outdated` or `messages-behind`, and exits 1 on any —
the gate to run in CI.

`create` installs the pages you pick the same way: the dependencies first
(from the root of a parent pnpm workspace when the new app is one of its
members, so the workspace keeps one lockfile), then `intelligo sync` of the
design-system base and every item, one `shadcn add` each. Scaffold files an
item replaces — `app/globals.css`, the theme provider, `lib/utils.ts` — move
from the `app-scaffold` record to the registry's (the feature's `handedOver`
list), so `upgrade --check` does not report them as yours forever.

## Why `migrate` is not `drizzle-kit migrate`

Drizzle applies migrations in journal-timestamp order and skips anything
numbered out of sequence, so a migration published behind the last applied
timestamp would never run and nothing would say so. `intelligo
migrate` selects pending work by content hash, applies it in one transaction,
and records it in the same table drizzle uses so both tools agree afterwards.

It also **refuses** a database that has the schema but no records — the state
`drizzle-kit push` leaves behind. Applying the chain to tables that already
exist fails part-way; `--check` reports the database as unmanaged instead, to be
baselined first.

`migrate --check` exits 1 whenever anything is pending or the database is ahead,
which an empty database and a stale one share. A deploy gate that must tell them
apart reads `--json`: one object on stdout whose `state` is `up_to_date`,
`pending`, `fresh` (empty database), `unmanaged`, `ahead` or `legacy`, beside
`exitCode`, `chain`, `applied`, `pending`, `unknown`, `legacy` and `adoptable`.

## `add maintenance` and its schedule

The route reconciles executions that are ten minutes stale, so it is meant to
run every five minutes. `add maintenance` writes that schedule to a new
`vercel.json`; an existing one is never touched — the entry to add is printed
instead. Vercel Hobby runs a cron at most once a day and refuses a deployment
that asks for more: there, or on any other host, call the route from your own
scheduler with `Authorization: Bearer $CRON_SECRET`.

## Licence

Apache-2.0
