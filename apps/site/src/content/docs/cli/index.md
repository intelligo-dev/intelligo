---
title: CLI
description: intelligo — scaffold an application, generate consumer-owned features, check configuration, apply the migration chain and preview upgrades.
order: 0
---

`@intelligo-dev/cli` ships the `intelligo` binary. A scaffolded app has it as a dev dependency, so run it with `pnpm exec intelligo`.

```text
intelligo create <dir>      Scaffold a new application
intelligo doctor            Report configuration and migration-chain problems
intelligo migrate           Apply the framework's migration chain to DATABASE_URL
intelligo migrate --check   Compare the framework's migrations to a database
intelligo add <feature>     Generate consumer-owned source (--force to overwrite)
intelligo upgrade --check   Show what a template upgrade would change
```

## create

```bash
pnpm dlx @intelligo-dev/cli@beta create my-app
```

Writes a registry-ready Next.js application into a new, empty directory: the composition root, plans, auth and Stripe routes, next-intl routing, shadcn base-nova with the intelligo tokens, a drizzle config for tables you own, and `intelligo.manifest.json`. It refuses a directory that isn't empty. See [Getting started](/docs/getting-started).

## add

Generates a feature's files into your app and records their hashes in the manifest.

| Feature | What it writes |
| --- | --- |
| `admin-page` | `app/admin/page.tsx` — mounts the Intelligo admin console |
| `maintenance` | `app/api/cron/maintenance/route.ts` — a `CRON_SECRET`-gated job that reconciles stale executions, drops expired reservations and rate-limit buckets, and expires trials |

Pages are not `add` features; they come from the [registry](/docs/registry).

## doctor

Checks the app and says why each problem matters: required environment, the migration chain against `DATABASE_URL`, billing registration, the maintenance secret, the auth mount, unregistered model ids, installed blocks against their requirements, and generated files you have customised. Exits non-zero when something is broken, so it can gate CI.

## migrate

Applies the framework's migration chain, shipped inside `@intelligo-dev/core`. It selects pending migrations by content hash — not by journal timestamp, which would silently skip an out-of-sequence entry — applies them in one transaction, and records them in the table drizzle uses, so both tools agree afterwards.

It refuses a database that has the schema but no migration records (what `drizzle-kit push` leaves); `--check` reports that state as `baseline`. Use `migrate --check` as a deploy gate.

## upgrade --check

Compares every generated file with the hash it was written with and the current template, and changes nothing:

- `current` — matches the template
- `outdated` — template changed, file untouched: safe to regenerate
- `conflict` — template changed and you edited the file
- `customized` — you edited it; template unchanged
- `deleted` — you removed it
