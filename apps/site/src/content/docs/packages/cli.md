---
title: "@intelligo-dev/cli"
description: "intelligo — create, add, doctor, migrate and upgrade --check."
order: 11
label: cli
---

## Install

```bash
pnpm add @intelligo-dev/cli
```

## Commands

```bash
npx @intelligo-dev/cli create my-app   # a registry-ready Next.js app
intelligo add <item>                   # install a registry page
intelligo doctor                       # what is misconfigured, and why it matters
intelligo migrate [--check]            # apply the framework chain
```

## Why `migrate` is not `drizzle-kit migrate`

Drizzle applies migrations in journal-timestamp order and skips anything
numbered out of sequence. This chain has one such entry, so a migration
published after it would never run and nothing would say so. `intelligo
migrate` selects pending work by content hash, applies it in one transaction,
and records it in the same table drizzle uses so both tools agree afterwards.

It also **refuses** a database that has the schema but no records — the state
`drizzle-kit push` leaves behind. Applying 44 migrations to tables that already
exist fails part-way; `--check` reports `baseline` instead.

The full command reference is on the [CLI page](/docs/cli).

[npm](https://www.npmjs.com/package/@intelligo-dev/cli) · [source](https://github.com/intelligo-mn/framework/tree/main/packages/cli)
