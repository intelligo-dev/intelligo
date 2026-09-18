# @intelligo-dev/cli

intelligo — create, add, doctor, migrate.

Part of [Intelligo](https://github.com/intelligo-mn/framework), an application
framework and operational platform for vertical AI SaaS products. This package
is published from that repository and is not meant to be used on its own.

## Install

```bash
pnpm add @intelligo-dev/cli@beta
```

## Commands

```bash
pnpm dlx @intelligo-dev/cli@beta create my-app   # a registry-ready Next.js app, plus the pages you pick
pnpm dlx @intelligo-dev/cli@beta create my-app --items chat,billing-settings --yes   # no questions
intelligo add <feature>                # generate consumer-owned source (admin-page, maintenance)
intelligo doctor                       # what is misconfigured, and why it matters
intelligo migrate [--check]            # apply the framework chain
intelligo upgrade --check              # what a template upgrade would change
```

## Why `migrate` is not `drizzle-kit migrate`

Drizzle applies migrations in journal-timestamp order and skips anything
numbered out of sequence. This chain has one such entry, so a migration
published after it would never run and nothing would say so. `intelligo
migrate` selects pending work by content hash, applies it in one transaction,
and records it in the same table drizzle uses so both tools agree afterwards.

It also **refuses** a database that has the schema but no records — the state
`drizzle-kit push` leaves behind. Applying the chain to tables that already
exist fails part-way; `--check` reports the database as unmanaged instead, to be
baselined first.

## Licence

Apache-2.0
