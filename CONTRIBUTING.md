# Contributing

## Before you write code

Read [AGENTS.md](AGENTS.md) — it is the single source of truth for the
architecture boundary, the commands, and the conventions — and the
[ADRs](docs/adr/README.md) for decisions that are settled. The one that
decides most pull requests is **the boundary**:

> Intelligo owns SaaS infrastructure: auth, workspaces/RBAC,
> entitlements, credits, billing, execution/usage/cost/audit records,
> jobs, the admin console, the CLI. The developer owns the product:
> routes, pages, UX, the AI framework used **natively**, prompts, tools,
> workflows, memory, RAG, product data.

A change that puts product vocabulary inside a framework package will
be declined even if it works. There is usually a registry for it
already; if there is not, proposing one is the better pull request.

## Setup

Prerequisites: Node 22.14 or newer, pnpm 9 (`corepack enable` picks the
version from `package.json`), and Docker for a local Postgres.

```bash
docker compose up -d   # Postgres with pgvector on localhost:5445
cp .env.example .env   # DATABASE_URL already points at it
# set BETTER_AUTH_SECRET in .env:  openssl rand -base64 32
pnpm install
pnpm db:migrate        # the framework's schema (intelligo migrate)
pnpm dev               # reference app :4002, site :4003
pnpm test              # the real suite (root vitest projects)
pnpm type-check
pnpm lint
```

Every app and package reads the repository root `.env`; an app-local
`.env` or the shell wins over it. `pnpm dev` runs every workspace app;
`pnpm --filter app dev` runs only the reference app.

## What a good pull request looks like

- **One concern.** Conventional commit subject, and a body that says
  why rather than restating the diff.
- **A test that would have failed before.** For a bug fix, the test
  that reproduces it. For a boundary change, a case in
  `tests/architecture/`.
- **Green locally**: `pnpm type-check && pnpm lint && pnpm test`.
  Suites that need Postgres skip unless the database is configured:
  the service integration suites read `DATABASE_URL`, the database
  suites `TEST_PG_URL`. CI runs both against a fresh database.
- **Migrations** are additive within a release, live in
  `packages/core/src/db/migrations/`, and must be registered in
  `meta/_journal.json`. CI replays the whole chain against an empty
  database, so an unregistered or non-replayable migration fails the
  build.
- **A changelog entry** under `[Unreleased]` in `CHANGELOG.md` for
  anything a consumer of the packages or the registry notices.
- **No new dependency** without saying in the pull request what it
  replaces or why nothing in the tree does the job.

## What will be declined

Import-side-effect registration — registries are populated
from an explicit composition root. Universal wrappers over an AI
framework — the framework is used natively and Intelligo
records only the execution boundary. Anything that widens a public
package's dependencies past the allowlist; the
dependency-direction test enforces this and it is not advisory.

## Code of conduct

Everyone taking part is expected to follow the
[Contributor Covenant](CODE_OF_CONDUCT.md).

## Reporting security issues

Privately, per [SECURITY.md](SECURITY.md). Never in a public issue or
pull request.

## Licence

Contributions are accepted under [Apache-2.0](LICENSE), the licence the
project ships under.
