# The reference application (`apps/app`)

What you get when you run `intelligo create` and then `shadcn add` for
every registry item — committed, so it can be read, run and checked.

- **It is generated, not written.** `pnpm app:regenerate` (from the
  repository root) wipes it and rebuilds it from the CLI and the
  registry; CI fails if the result differs from what is committed.
- **Do not develop in it.** A page that needs changing changes in
  `packages/registry/base/`, a service in its package; the few files
  that are this app's own are listed, each with its reason, in
  `scripts/reference-app-owned.json`.
- **Your product does not start here.** It starts with `create` in your
  own repository and consumes the npm packages.

Run it with `pnpm --filter app dev` (port 4002).

## Why it exists

The executable specification for Intelligo, and the one consumer of
the packages that lives in this repository. It exists to answer one
question empirically: **can a product be built on these packages
without any real product's domain in the room?** Anything it cannot do
without editing a framework file is a boundary defect, not a missing
feature here.

It is deliberately small and deliberately generic. It is not a second
product, not a demo, and not a place to prototype product features.

It has a second, equally load-bearing role: it is the **canonical
installed result of the Intelligo registry**.
Every registry item lands here the same way it would in any consumer's
repository — via `shadcn add`, never hand-written — so a hand-maintained
parallel implementation drifting from what `shadcn build` actually
produces is itself a defect this app exists to catch.

## What it demonstrates

- signup / login / workspace creation (`@intelligo-dev/auth`)
- an assistant route that runs a model call inside the execution
  boundary — entitlement, credit hold, usage, cost, audit
  (`@intelligo-dev/executions`)
- plans and feature gates registered by the _app_, not baked into
  billing (`@intelligo-dev/billing` + the plan registry)
- usage and execution history read back through the packages' own
  query APIs
- real registry items — pages, components, actions — installed
  verbatim from `packages/registry/`, wired to this app's own backend
  composition

## Consuming the registry

The design tokens in `app/globals.css` are the `intelligo` registry base:
shadcn base-nova with status, layer and motion tokens, exactly
what `shadcn add https://intelligo.dev/r/intelligo.json` writes. They are
consumer-owned; re-value them to re-theme every installed page.

## What it must never do

- import an `@intelligo-dev/*` package this repository does not publish
- use a real product's vocabulary in its plans, features, or copy
- work around a package by reaching into its internals
- maintain a page or component that a registry item should have
  installed instead

The dependency-direction test enforces the first; the registry
architecture test enforces the no-orphans/no-private-imports checks on
`packages/registry/`; review enforces the rest.

## Deploying (Vercel + Neon)

`vercel.json` is the whole build: it compiles the CLI (its bin is not
built in a fresh clone, so pnpm cannot link `intelligo`), applies the
framework's migration chain and then the app's own, and builds. Both
chains are idempotent, so every deployment runs them.

1. Import the repository in Vercel with **Root Directory `apps/app`**;
   the framework is detected and pnpm installs the whole workspace.
2. Add a Neon database (the Vercel integration sets `DATABASE_URL`).
   The pooled URL is fine: the driver is chosen from the host.
3. Set the environment:

   | Variable                                     | Why                                                                                        |
   | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
   | `BETTER_AUTH_SECRET`                         | 32+ characters (`openssl rand -base64 32`)                                                 |
   | `NEXT_PUBLIC_APP_URL`                        | the deployment's origin; it is the only origin auth trusts                                 |
   | `CRON_SECRET`                                | 32+ characters; Vercel sends it to `/api/cron/maintenance`                                 |
   | `RESEND_API_KEY`, `EMAIL_FROM`               | production requires a verified email before sign-in, so without a sender nobody can log in |
   | `PLATFORM_ADMIN_EMAILS`                      | who reaches `/admin`                                                                       |
   | `GOOGLE_GENERATIVE_AI_API_KEY`               | optional; without it chat runs on the stub model and costs nothing                         |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | optional; checkout stays unavailable without them                                          |

The cron runs daily because that is what Vercel's Hobby plan allows;
on Pro, schedule it every five minutes (`*/5 * * * *`) so stale
executions are reconciled promptly. A preview deployment has its own
origin, so it needs its own `NEXT_PUBLIC_APP_URL` (and, with the Neon
integration, gets its own database branch).
