---
title: Deploying
description: Put the app on Vercel with Postgres and pgvector, apply both migration chains on every deploy, and get email, Stripe webhooks and the cron working.
order: 6
---

At the end of this page the app runs in production, migrates its database on every deploy and does its periodic work on a schedule. Nothing in the scaffold is local-only: the same `lib/intelligo.ts` composes production, and only the environment changes.

## The database

You need Postgres with the `pgvector` extension available: the baseline migration runs `CREATE EXTENSION IF NOT EXISTS vector`.

The driver is chosen from the URL by `selectDriver`:

| `DATABASE_URL`                                 | Driver                                   |
| ---------------------------------------------- | ---------------------------------------- |
| Contains `neon.tech` or an `@ep-…` endpoint id | `neon-serverless` — Neon over WebSockets |
| Anything else                                  | `pg` — node-postgres                     |

Set `INTELLIGO_DB_DRIVER` to `pg` or `neon-serverless` to force one. Neon's HTTP driver is not an option: it cannot run transactions, and quota admission and usage settlement are transactions.

Both drivers open one pool per server process, on the first query, so `next build` needs no database. On a serverless host every function instance holds its own pool; a long-running server holds one. The WebSocket driver uses the global `WebSocket` of Node 22 and newer. The framework does not distinguish a pooled connection string from a direct one: the app, `intelligo migrate` and `drizzle.config.ts` all read `DATABASE_URL`.

## Migrations on every deploy

One database holds two migration chains, and the scaffold's `db:migrate` script applies them in order: `intelligo migrate && drizzle-kit migrate`.

- `intelligo migrate` applies the framework's chain from `@intelligo-dev/core`. It selects pending migrations by content hash and runs them in one transaction, so a failure leaves neither statements nor records behind.
- `drizzle-kit migrate` applies the tables you own (`lib/db/schema.ts`), recorded separately in `drizzle.__app_migrations`.

Run it in the build, before `next build`:

```json title="vercel.json"
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "pnpm db:migrate && pnpm build"
}
```

A refused or failed migration exits 1 and fails the build, so the previous deployment keeps serving. The build migrates whatever database its `DATABASE_URL` names — give preview environments their own.

The reference app does the same from inside the monorepo, where the CLI is a workspace package it has to build and run by path:

<!-- snippet: apps/app/vercel.json -->

```json title="apps/app/vercel.json"
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "pnpm --filter @intelligo-dev/cli build && node ../../packages/cli/dist/bin.js migrate && pnpm exec drizzle-kit migrate && pnpm build",
  "crons": [{ "path": "/api/cron/maintenance", "schedule": "0 3 * * *" }]
}
```

### The deploy gate

`pnpm db:check` runs `intelligo migrate --check`, which compares the framework chain with the database and changes nothing. Use it where a separate step applies migrations, or before a rollback.

| It prints                                  | Meaning                                                                              | Exit |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | ---- |
| `✓ Up to date (n/n applied)`               | Code and schema agree                                                                | 0    |
| `✗ n migration(s) pending`                 | Deploying now runs code against an older schema                                      | 1    |
| `✗ Database is ahead`                      | The database applied migrations this checkout lacks — a rollback, or an older `core` | 1    |
| `! This database has no migration records` | Empty, or provisioned with `drizzle-kit push`; printed with the pending line         | 1    |
| `! … ran the framework's pre-1.0 chain`    | `migrate` records the baseline without running it, then applies the rest             | 1    |

`intelligo migrate` refuses, with exit 1, a database that is ahead, one that ran part of the pre-1.0 chain, and one that has the framework's tables but no records. The last needs baselining once; the steps are in `node_modules/@intelligo-dev/core/src/db/migrations/README.md`.

## Environment

`instrumentation.ts` runs `composeIntelligo()` once per server process, and its first line is `assertEnv()`. A missing `DATABASE_URL`, `BETTER_AUTH_SECRET` (32 characters or more) or `NEXT_PUBLIC_APP_URL` throws at startup with the list of what is missing.

`NEXT_PUBLIC_APP_URL` must be the public `https://` URL: auth callbacks, email links and redirects are built from it.

With `NODE_ENV=production`, `assertEnv()` also logs an `[Env]` warning for each of these:

| Warning                                    | Consequence                                               |
| ------------------------------------------ | --------------------------------------------------------- |
| No `RESEND_API_KEY` or `LOOPS_API_KEY`     | Sign-ups are not email-verified; mail goes to the console |
| `STRIPE_SECRET_KEY` starts with `sk_test_` | Production is running on a Stripe test key                |
| `CRON_SECRET` unset or under 32 characters | The maintenance route answers 403                         |

Every variable is listed in [Environment](/docs/getting-started/environment).

## Email

Sign-ups are held for email verification only when a provider is configured. Without one, verification, invitation and reset links are printed to the server log. Set a provider key, and set `EMAIL_FROM` to an address on a domain your provider lets you send from — there is no built-in sender, so with Resend and no `EMAIL_FROM` every send fails and startup warns about it. Loops takes the sender from each template.

## The Stripe webhook

In Stripe, add an endpoint at `NEXT_PUBLIC_APP_URL` + `/api/webhooks/stripe` and put its signing secret in `STRIPE_WEBHOOK_SECRET`. The scaffolded route verifies the signature, records each event before handling it and answers 500 on a handler error so Stripe retries. [Billing with Stripe](/docs/guides/billing-stripe) covers the events and plans.

## The maintenance cron

```bash
pnpm exec intelligo add maintenance
```

This writes `app/api/cron/maintenance/route.ts`, which is yours to extend. One `GET` does five things:

| Step                                                 | Effect                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `findStaleExecutions`, then `executions.reconcile()` | Runs unfinished after 10 minutes are settled from recorded usage, or failed and their hold released |
| `cleanupExpiredReservations`                         | Table hygiene; admission already ignores them                                                       |
| `cleanupRateLimitEntries`                            | Table hygiene                                                                                       |
| `processTrialExpirations`                            | Expires trials and sends the reminder emails                                                        |
| `pruneJobs`                                          | Deletes finished jobs older than a week                                                             |

It does not drain the job queue: draining needs your handlers.

The route requires `Authorization: Bearer $CRON_SECRET`. It answers 403 while `CRON_SECRET` is unset or shorter than 32 characters, 401 on a wrong token, and otherwise a JSON summary — 200, or 207 when a step failed.

On Vercel, `intelligo add maintenance` writes the `crons` entry to `vercel.json` when the app has none, and prints it for you to add when one exists; Vercel sends the header itself. The entry runs every five minutes (`0-59/5 * * * *`). Vercel's Hobby plan only allows daily crons, which leaves a failed turn's credit hold in place for up to a day rather than ten minutes — the reference app runs daily for that reason. From any other scheduler:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/cron/maintenance
```

## Pre-flight

Run `pnpm exec intelligo doctor` with the production variables before the first deploy. It exits non-zero on any error from these checks: `migrations` (journal and `.sql` files agree), `env` (the three required variables), `billing` (`INTELLIGO_BILLING_PRODUCT`), `item:<name>` (each installed page's files, exports and feature keys), `maintenance` (`CRON_SECRET` when the route exists), `auth-mount` (`/api/auth` is mounted), `models` (the composition root calls `registerModels`) and `generated` (the manifest).

After bumping `@intelligo-dev/*` versions, run `pnpm exec intelligo upgrade --check`. It lists generated files whose template changed and exits 1 only on a conflict — a file that both you and the template changed. The [CLI reference](/docs/cli) describes both.

## Not on Vercel

The app is a standard Next.js 16 server: `pnpm db:migrate`, `pnpm build`, `pnpm start`, plus a scheduler for the maintenance route. Only `@intelligo-dev/next` imports `next/*`; it supplies `nextRequestContext` and the auth route handlers. Nothing in the framework depends on Vercel.

## Next

- [Environment](/docs/getting-started/environment)
- [Billing with Stripe](/docs/guides/billing-stripe)
- [The composition root](/docs/concepts/composition-root)
