# AGENTS.md

## Project

**Intelligo** — open-source **application framework and operational platform** for vertical AI SaaS products (NOT a starter kit, NOT another AI framework). Turborepo monorepo with pnpm workspaces: the framework packages, the shadcn-compatible page registry, and a reference application that is the registry's canonical installed result.

This repository is the framework's home. It is edited here, and every workspace under `packages/` is released to npm as `@intelligo-dev/*` by **one release commit**: bump every published manifest to the new version and head `CHANGELOG.md` with a `## [X.Y.Z]` section. Merging it to main runs `.github/workflows/release.yml`, which builds, runs the full suite, publishes under the dist-tag the version implies (`1.0.0-beta.N` → `beta`, a plain `1.0.0` → `latest`), pushes the `vX.Y.Z` tag, creates the GitHub release from that changelog section and applies `scripts/npm-deprecations.json`. A version with no changelog section does not release. `apps/site` deploys intelligo.dev and serves the page registry at `/r`. Products built on the framework live in their own repositories and consume the npm packages; nothing product-specific belongs here (`tests/architecture/publishability.test.ts` enforces it).

**Decisions:** [docs/adr/](docs/adr/README.md) — read ADR-0003 (AI frameworks stay native), ADR-0005 (composition root), ADR-0007 (execution boundary), ADR-0009 (persistence contracts), ADR-0010 (i18n-native registry), ADR-0011 (package topology), ADR-0012 (headless chat transport), ADR-0013 (design system) before changing anything they cover.

## The boundary (read before writing code)

- Intelligo owns SaaS infrastructure: auth, workspaces/RBAC, entitlements, credits, billing, execution/usage/cost/audit records, conversation/document/identity persistence (ADR-0009), jobs, admin console, CLI, and the page registry.
- The developer owns the product: the AI framework used **natively** (no universal agent abstractions — ADR-0003), prompts, tools, workflows, product data, and every installed page as **consumer-owned source**.
- **Pages ship through the registry, not through packages.** `packages/registry/` (a private workspace, never published) holds the source of the shadcn-schema items; `pnpm registry:build` emits `packages/registry/public/r/*.json`, which `apps/site` publishes at `intelligo.dev/r/<item>.json`; consumers install with the standard shadcn CLI. No runtime UI package is required to render them.
- **Installed items are used verbatim (ADR-0010).** Product variance flows only through consumer-owned config: `lib/shell-config.tsx` (banner, header-right), `lib/nav-config.ts`, `lib/chat-config.tsx` (agent identity, starters, headerRight, auto-continue), `lib/chat-renderers.tsx`, `lib/onboarding-steps.ts`, `lib/billing-config.ts` (product slug, credit bundles), `lib/workspace-bootstrap.ts`, `lib/document-patterns.ts` — and message files. Never edit an installed component; grow a seam in `packages/registry/base/` instead.
- **Items are i18n-native (ADR-0010).** Copy lives in per-item next-intl namespaces (`messages/en/<item>.json`, namespace = item name); page targets are `app/[locale]/...`; navigation goes through the consumer's `@/i18n/navigation`. Adding a language = adding `messages/<locale>/*.json`.
- No product vocabulary inside a framework package. A change that needs one is a missing registry or port, and that is the better pull request.
- Import-side-effect registration is banned (ADR-0005); registries are populated from an explicit composition root. Business logic lives in package services behind ports; Server Actions and Route Handlers are thin callers.

## Commands

```bash
pnpm dev              # reference app on :4002
pnpm build            # Build all
pnpm lint / pnpm type-check
pnpm test             # Vitest (root projects config — the real suite)
pnpm vitest run path/to/file.test.ts

# Registry
pnpm registry:build   # shadcn build → packages/registry/public/r/*.json
# Install an item (run INSIDE the consumer app, absolute artifact path —
# relative paths trip shadcn 3.8's unsafe-path check on (group)/ targets):
cd apps/app && pnpm exec shadcn add "$PWD/../../packages/registry/public/r/<item>.json" --yes

# Database (drizzle-kit reads the repository-root .env)
pnpm db:push | db:generate | db:migrate | db:studio | db:check
```

Env: workspace apps load the **repository root `.env`** as fallback (app-local `.env` and shell win). Configure `DATABASE_URL` once at the root; `docker compose up -d` gives you a local Postgres with pgvector.

## Monorepo Layout

### Registry (`packages/registry/`)

A private workspace (`@intelligo-dev/registry`, never published): `registry.json` (official shadcn schema) + `base/<item>/**` source; build output `public/r/` is gitignored; `lint` runs with the rest of the tree. Items: smoke, app-shell, dashboard, auth-login/signup/password-reset/email-verification, onboarding, invitation-accept, workspace/team/profile/privacy-settings, pricing, checkout, billing-settings, usage, notifications, chat, artifacts, route-error. Design system (ADR-0013): the `intelligo` `registry:base` item carries base-nova config and the token contract; Intelligo's own components (T3 AI parts, T4 patterns) are `registry:ui` items under `base/ui/<name>/`, named `@intelligo/<name>` in `registryDependencies`; items compose with `render` (Base UI), never `asChild`, and use semantic tokens only. `tests/architecture/design-system.test.ts` enforces the authoring rules, the token contract on every surface and WCAG AA contrast. `tests/architecture/registry.test.ts` enforces: schema shape, no orphans, no unpublished/dissolved/`@intelligo-dev/ui` imports, declared `@intelligo-dev/*` dependencies.

### Packages

| Package                     | Responsibility                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@intelligo-dev/core`       | DB schema (Drizzle + Neon + pgvector), email, logger, env, notifications, **conversations, documents, identity** (ADR-0009); dependency-free leaves `/registry`, `/money`, `/request-context`, `/prompt`    |
| `@intelligo-dev/auth`       | Better-Auth multi-tenant workspaces, RBAC, `requireAuth/Workspace/Role`, typed `orgApi`, **team / workspace / profile / onboarding services** (ports)                                                       |
| `@intelligo-dev/next`       | The one package that imports `next/*`: `nextRequestContext` (bound from the composition root) and `/auth` (Better-Auth's route handlers)                                                                    |
| `@intelligo-dev/billing`    | Quota engine, credits, Stripe, feature gates, trials, rate limiting, **checkout + billing-overview service**; `/plans`, `/plan-registry`, `/payment`, `/quota-types` reach neither Stripe nor `server-only` |
| `@intelligo-dev/chat`       | The AI-SDK-native chat transport: `createChatHandler(config)` → `{ POST, DELETE }` over Web `Request`/`Response`; `/client` for the UI, `/testing` for the stub model (ADR-0012)                            |
| `@intelligo-dev/executions` | Execution lifecycle via ports (`createExecutions`), queries, `/pricing` model registry + cost math                                                                                                          |
| `@intelligo-dev/audit`      | Append-only audit events + memory-audit contract                                                                                                                                                            |
| `@intelligo-dev/jobs`       | Postgres-backed job queue                                                                                                                                                                                   |
| `@intelligo-dev/mastra`     | Optional bridge from a native agent to the execution boundary                                                                                                                                               |
| `@intelligo-dev/admin`      | Operational console (Intelligo-owned, excluded from the registry)                                                                                                                                           |
| `@intelligo-dev/cli`        | `create` / `add` / `doctor` / `migrate --check` / `upgrade --check`; scaffold is registry-ready (shadcn + Tailwind 4 + next-intl + composition root)                                                        |

Every workspace under `packages/` is published except `packages/registry` (`private: true`); `tests/architecture/publishability.test.ts` audits the tree for it (licence metadata, no credentials, no product vocabulary). **One package per runtime target / peer dependency / adapter; shared pure-TypeScript modules are subpaths** (ADR-0011) — `money`, `http` and `billing-core` were folded under that rule.

### Apps

- **`apps/app`** — the canonical installed result and executable boundary check, regenerated with `intelligo create` + `shadcn add` and never hand-edited (`tests/architecture/reference-app.test.ts` fails on drift outside the seams): a full generic workspace AI SaaS (signup → verify → login → shell → dashboard → team → billing → usage → notifications → chat with a stub model → artifacts) built ONLY from the packages + registry items, en-only, no Mastra installed. If a package change requires editing this app for a product reason, the boundary moved.
- **`apps/site`** — intelligo.dev: the framework's public site (Astro static + React islands) and the **hosted page registry** at `https://intelligo.dev/r/<item>.json`. Everything it says about the framework is generated by `pnpm sync` (a turbo task downstream of the registry build) from this tree (registry items, counts, the reference app's primitives) and committed, so it cannot describe a page that does not exist. Deployed as static assets on Cloudflare Workers (root directory `apps/site`).

## API Layer

Server Actions are thin transports over package services (installed `actions/*`): parse → service → map typed error (`TeamServiceError` etc.) to the UI shape → revalidate. Route handlers: `/api/chat` (two lines: `createChatHandler(chatServerConfig)` from `@intelligo-dev/chat` — auth, rate limit, feature gate, windowing, `executions.begin()`, persistence), `/api/assistant`, `/api/auth/[...all]` (`@intelligo-dev/next/auth`), `/api/webhooks/stripe`.

## Key Patterns

- **Ports over dependencies** — services take ports (`checkMemberLimit`, `onAccountDeleted`, `checkEntitlement`…); consumers bind them in `lib/*.ts`. auth never imports billing; core imports nothing; only `next` imports `next/*` (the request's headers reach the framework through `core/request-context`, bound once from the composition root).
- **Model ids are registry keys** — every provider-prefixed literal must exist in `MODEL_CONFIGS` (`@intelligo-dev/executions/pricing`). Unregistered ids silently run on the fallback model and bill wrongly; an architecture test enforces registration.
- **Tenant scoping** — every query filters `workspaceId` (+ `userId` where user-private); core services take resolved actor ids, transports gate with `requireWorkspace`/`requireRole` first.
- **Optimistic middleware, authoritative server** — middleware only redirects; real checks are server-side. Middleware never touches the DB.
- **`sessions.activeOrganizationId` exists** — workspace switching persists; always pass explicit `organizationId` to Better-Auth reads anyway.
- **RSC boundary discipline** — never pass component/function values from a server layout to client components (nav icons live in client-imported `lib/nav-config.ts`); `"use server"` files must not `export type`; next-intl's `redirect` takes `{ href, locale }`.
- **Platform admin is a row, not an env var** — `users.role`, seeded from `PLATFORM_ADMIN_EMAILS` on first use.
- **Input sanitization** — anything user-authored that reaches a system prompt (a stored summary, injected profile context) passes `sanitizeForSystemPrompt()` from `@intelligo-dev/core/prompt` at the concatenation point; `detectPromptInjection()` says what it saw, for the log. A product extends the pattern list rather than replacing the sweep.

## Conventions

- TypeScript strict; ESLint flat config; `_`-prefix for allowed unused vars.
- **i18n via next-intl**: per-item namespaces under `messages/<locale>/<item>.json` (merged by filename in `i18n/request.ts`).
- Vitest: root projects config; mock `@ai-sdk/*` for CI; `vi.stubEnv` + `vi.resetModules` + dynamic import for module-load-time env; integration suites `describe.skipIf(!TEST_PG_URL)`.
- `pnpm.overrides` pins `pg` 8.18.0; the ajv floor is scoped `ajv@6` (shadcn needs ajv 8). Dependabot alerts on transitive packages are resolved there too — a `>=` floor, scoped to the major already in the tree (`js-yaml@4`, `^0.28.x`) where a newer major exists, never a forced major.
- Conventional commits, small and scoped; repo stays green after every slice.

## Tech Stack

Next.js 16 (Turbopack), React 19, TypeScript 5.9, Tailwind CSS 4, shadcn/ui base-nova on Base UI (registry + consumer-owned primitives), Drizzle ORM, Neon PostgreSQL + pgvector, Better-Auth, Stripe, Resend, Vercel AI SDK 6, next-intl, Turborepo, pnpm 9, Vitest. Drizzle over Prisma; Better-Auth over NextAuth; no Redis; no Pinecone; no tRPC.
