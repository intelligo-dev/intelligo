---
title: Getting started
description: Create an application, connect PostgreSQL, install the pages and run the whole product against a stub model — before you configure an AI provider.
order: 0
label: Quickstart
---

## Requirements

- Node 22.14 or newer and pnpm 9
- A PostgreSQL database — Neon works well; locally, any Postgres with the `pgvector` extension

## Create the application

```bash
pnpm dlx @intelligo-dev/cli@beta create my-app
```

`create` asks which pages you want — the shell, sign-in, the dashboard and the chat are ticked to start with — adds the pages they build on, and shows you the commands that install them: `pnpm install` (shadcn is one of the scaffold's dev dependencies), then `shadcn add` for the design-system base and your pages, in the order they need. Nothing runs until you approve. `--items chat,billing-settings` or `--all` answers the question up front, `--yes` approves the commands, and `--no-install` stops after the scaffold.

`create` writes a Next.js 16 application with shadcn (base-nova), Tailwind 4 and next-intl already wired, plus the files that make it an Intelligo app:

| File                               | What it is                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `lib/intelligo.ts`                 | The [composition root](/docs/concepts/composition-root): plans, models, the request context and the execution boundary, bound once |
| `lib/plans.ts`                     | Your plans and which features each grants                                                                                          |
| `instrumentation.ts`               | Runs the composition root once per server process                                                                                  |
| `app/api/auth/[...all]/route.ts`   | Better-Auth's handlers, from `@intelligo-dev/next/auth`                                                                            |
| `app/api/webhooks/stripe/route.ts` | The Stripe webhook receiver                                                                                                        |
| `intelligo.manifest.json`          | A hash of every generated file, so `doctor` and `upgrade --check` know what you changed                                            |

Every one of these is yours from the first commit. Intelligo never overwrites them.

## Configure the environment

```bash
cp .env.example .env.local
```

Two values are required before the app boots:

```ini title=".env.local"
DATABASE_URL=postgres://…
BETTER_AUTH_SECRET=…   # any long random string
```

`NEXT_PUBLIC_APP_URL` defaults to `http://localhost:3000`. Stripe keys, `CRON_SECRET` and `PLATFORM_ADMIN_EMAILS` can wait until you need billing, maintenance or the admin console.

## Create the tables

```bash
pnpm db:migrate
```

This runs `intelligo migrate` — the framework's migration chain, selected by content hash and applied in one transaction — and then `drizzle-kit migrate` for tables you add yourself. Don't provision with `drizzle-kit push`: a pushed database has the schema but no migration records, and the migrator refuses it rather than half-applying the chain.

## Add pages later

Pages arrive through the registry as source you own. Anything you did not pick at `create` installs with the shadcn CLI, from the `@intelligo` registry the scaffold's `components.json` already names:

```bash
pnpm exec shadcn add @intelligo/billing-settings
```

Some blocks import files another block ships, so the order matters. [Installing blocks](/docs/registry) has the full order, and [/blocks](/blocks) shows every block live.

## Run it

```bash
pnpm dev
```

Open `http://localhost:3000`, sign up and start a chat. The chat streams against a built-in stub model, so sign-up, workspaces, team, billing, usage, chat and artifacts all work before you add an API key.

```bash
pnpm exec intelligo doctor
```

`doctor` reports what is still missing: environment, migrations, billing registration, the auth mount, unregistered models, and generated files you have customised.

## Next

- [The boundary](/docs/concepts/boundary) — what Intelligo owns and what stays yours
- [Bring your agent](/docs/guides/bring-your-agent) — replace the stub with your model, prompt and tools
- [Config seams](/docs/registry/config-seams) — change what the installed pages show without editing them
