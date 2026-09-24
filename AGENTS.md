# AGENTS.md

## Project

**Intelligo** — open-source **application framework and operational platform** for vertical AI SaaS products (NOT a starter kit, NOT another AI framework). Turborepo monorepo with pnpm workspaces (`packages/*`, `apps/*`, `tools/*`): the framework packages, the shadcn-compatible page registry, and a reference application that is the registry's canonical installed result.

This repository is the framework's home. It is edited here, and every workspace under `packages/` is released to npm as `@intelligo-dev/*` by **one release commit**: bump every published manifest to the new version and head `CHANGELOG.md` with a `## [X.Y.Z]` section. Merging it to main runs `.github/workflows/release.yml`, which builds, runs the full suite, proves a consumer can install what is about to ship — packed-package compatibility, an app scaffolded outside the monorepo from the packed tarballs that builds and boots with every registry item installed (`scripts/consumer-smoke.sh`), and `apps/app` still being exactly the CLI's output (`app:regenerate --check`) — publishes under the dist-tag the version implies (`1.0.0-beta.N` → `beta`, a plain `1.0.0` → `latest`), pushes the `vX.Y.Z` tag and creates the GitHub release from that changelog section. The publish runs after CI passes, through npm trusted publishing (OIDC, provenance, no token); deprecations in `scripts/npm-deprecations.json` are a maintainer's `node scripts/npm-maintain.mjs`, and so is the prerelease `latest` tag, which the release run only reports when it is behind (npm accepts the OIDC identity for `publish` only, so far). A version with no changelog section does not release. `apps/website` deploys intelligo.dev and serves the page registry at `/r`. Products built on the framework live in their own repositories and consume the npm packages; nothing product-specific belongs here (`tests/architecture/publishability.test.ts` enforces it).

**Decisions:** these are settled, and the maintainers keep the record of why privately — raise it with them before changing any of them: the AI-framework boundary (frameworks stay native), the composition root, the execution boundary, persistence contracts, the i18n-native registry, package topology, the headless chat transport, the design system (and its primitives' motion), the chat extension contract, and money as micros with a currency.

## The boundary (read before writing code)

- Intelligo owns SaaS infrastructure: auth, workspaces/RBAC, entitlements, credits, billing, execution/usage/cost/audit records, conversation/document/identity persistence, jobs, admin console, CLI, and the page registry.
- The developer owns the product: the AI framework used **natively** (no universal agent abstractions), prompts, tools, workflows, product data, and every installed page as **consumer-owned source**.
- **Pages ship through the registry, not through packages.** `packages/registry/` (a private workspace, never published) holds the source of the shadcn-schema items; `pnpm registry:build` emits `packages/registry/public/r/*.json`, which `apps/website` publishes at `intelligo.dev/r/<item>.json`; consumers install with the standard shadcn CLI. No runtime UI package is required to render them.
- **Installed items are used verbatim.** Product variance flows only through consumer-owned config: `lib/shell-config.tsx` (banner, header-right), `lib/nav-config.ts`, `lib/chat-config.tsx` (agent identity, starters, headerRight, auto-continue), `lib/chat-renderers.tsx`, `lib/onboarding-steps.ts`, `lib/billing-config.ts` (product slug, credit bundles), `lib/workspace-bootstrap.ts`, `lib/document-patterns.ts` — and message files. Never edit an installed component; grow a seam in `packages/registry/base/` instead.
- **Items are i18n-native.** Copy lives in per-item next-intl namespaces (`messages/en/<item>.json`, namespace = item name); page targets are `app/[locale]/...`; navigation goes through the consumer's `@/i18n/navigation`. Adding a language = adding `messages/<locale>/*.json`.
- No product vocabulary inside a framework package. A change that needs one is a missing registry or port, and that is the better pull request.
- Import-side-effect registration is banned; registries are populated from an explicit composition root. Business logic lives in package services behind ports; Server Actions and Route Handlers are thin callers.

## Commands

```bash
pnpm dev              # reference app on :4002
pnpm build            # Build all
pnpm lint / pnpm type-check
pnpm test             # Vitest (root projects config — the real suite)
pnpm vitest run path/to/file.test.ts
pnpm test:mutation    # Stryker over the scope in stryker.config.mjs (~1 min)

# Registry
pnpm registry:build   # shadcn build → packages/registry/public/r/*.json
# Install an item (run INSIDE the consumer app, absolute artifact path —
# relative paths trip shadcn 3.8's unsafe-path check on (group)/ targets):
cd apps/app && pnpm exec shadcn add "$PWD/../../packages/registry/public/r/<item>.json" --yes

# Database (reads the repository-root .env)
pnpm db:migrate       # intelligo migrate — the framework's schema, by content hash
pnpm db:generate      # drizzle-kit generate after a schema change (core)
pnpm db:studio | db:check
```

Env: workspace apps load the **repository root `.env`** as fallback (app-local `.env` and shell win). Configure `DATABASE_URL` and `BETTER_AUTH_SECRET` once at the root; `docker compose up -d` gives you a local Postgres with pgvector on 5445.

## Monorepo Layout

### Registry (`packages/registry/`)

A private workspace (`@intelligo-dev/registry`, never published): `registry.json` (official shadcn schema) + `base/<item>/**` source; build output `public/r/` is gitignored; `lint` runs with the rest of the tree. Items: smoke, app-shell (on `ai-sidebar`), settings-shell, dashboard, auth-login/signup/password-reset/email-verification, onboarding, invitation-accept, workspace/team/profile/privacy-settings, language-switcher, pricing, checkout, billing-settings, feature-gating, trial-banner, payment-poll, usage, notifications, chat, chat-panel, chat-widget, chat-share, chat-eve (the `registry:lib` binding, not a page), artifacts, route-error; T4 motion items: popover-morph, select-morph, morphing-modal, notification-stack, animated-list, otp-input, file-upload, expandable-tabs, hold-action-button. Design system: the `intelligo` `registry:base` item carries base-nova config and the token contract; Intelligo's own components (the interactive T1 primitives — button, tabs, tooltip, menus, dialogs, form controls — restyled over Base UI with shadcn's API kept, T3 AI parts, T4 patterns) are `registry:ui` items under `base/ui/<name>/`, named `@intelligo/<name>` in `registryDependencies`; items compose with `render` (Base UI), never `asChild`, and use semantic tokens only. Motion is `motion/react` on the shared vocabulary in `ai-motion` (springs, `popupMotion`, `useOpenState`, `Press`, list staggers); every file importing `motion/react` reads `useReducedMotion`; a primitive's popup keeps its root controlled so the exit plays; `button.tsx` stays free of `"use client"` so `buttonVariants` works in server components. Licences of adapted code live in `packages/registry/LICENSES.md`; comments never name where code came from. `tests/architecture/design-system.test.ts` enforces the authoring rules, the token contract on every surface and WCAG AA contrast. `tests/architecture/registry.test.ts` enforces: schema shape, no orphans, no unpublished/dissolved/`@intelligo-dev/ui` imports, declared `@intelligo-dev/*` dependencies.

### Packages

| Package                     | Responsibility                                                                                                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@intelligo-dev/core`       | DB schema (Drizzle + Neon + pgvector), email, logger, env, notifications, **conversations, documents, identity**; dependency-free leaves `/registry`, `/money`, `/request-context`, `/prompt`                                     |
| `@intelligo-dev/auth`       | Better-Auth multi-tenant workspaces, RBAC, `requireAuth/Workspace/Role`, typed `orgApi`, **team / workspace / profile / onboarding services** (ports)                                                                             |
| `@intelligo-dev/next`       | The one package that imports `next/*`: `nextRequestContext` (bound from the composition root) and `/auth` (Better-Auth's route handlers)                                                                                          |
| `@intelligo-dev/billing`    | Quota engine, credits, Stripe, feature gates, trials, rate limiting, **checkout + billing-overview service**; `/plans`, `/plan-registry`, `/payment`, `/quota-types` reach neither Stripe nor `server-only`                       |
| `@intelligo-dev/chat`       | The AI-SDK-native chat transport: `createChatHandler(config)` → `{ POST, DELETE }` over Web `Request`/`Response`; `/client` for the UI, `/testing` for the stub model                                                             |
| `@intelligo-dev/executions` | Execution lifecycle via ports (`createExecutions`), queries, `/pricing` model registry + cost math                                                                                                                                |
| `@intelligo-dev/audit`      | Append-only audit events + memory-audit contract                                                                                                                                                                                  |
| `@intelligo-dev/jobs`       | Postgres-backed job queue                                                                                                                                                                                                         |
| `@intelligo-dev/mastra`     | Optional bridge from a native agent to the execution boundary                                                                                                                                                                     |
| `@intelligo-dev/admin`      | Operational console (Intelligo-owned, excluded from the registry)                                                                                                                                                                 |
| `@intelligo-dev/cli`        | `create` / `add` / `doctor` / `migrate --check` / `upgrade --check` / `sync` (registry pages from the bundled registry, seams kept, drift check); scaffold is registry-ready (shadcn + Tailwind 4 + next-intl + composition root) |

Every workspace under `packages/` is published except `packages/registry` (`private: true`); `tests/architecture/publishability.test.ts` audits the tree for it (licence metadata, no credentials, no product vocabulary). **One package per runtime target / peer dependency / adapter; shared pure-TypeScript modules are subpaths** — `money`, `http` and `billing-core` were folded under that rule.

### Apps

- **`apps/app`** — the canonical installed result and executable boundary check, generated, not written: `pnpm app:regenerate` runs `intelligo create` + `intelligo sync` for every item and keeps only the files listed with reasons in `scripts/reference-app-owned.json`; CI runs `pnpm app:regenerate --check` and `tests/architecture/reference-app.test.ts` fails on drift outside the seams: a full generic workspace AI SaaS (signup → verify → login → shell → dashboard → team → billing → usage → notifications → chat with a stub model → artifacts) built ONLY from the packages + registry items, en-only, no Mastra installed. If a package change requires editing this app for a product reason, the boundary moved.
- **`apps/website`** — intelligo.dev: the framework's public site (Astro static + React islands) and the **hosted page registry** at `https://intelligo.dev/r/<item>.json`. Everything it says about the framework is generated by `pnpm sync` (a turbo task downstream of the registry build) from this tree (registry items, counts, the reference app's primitives) and committed, so it cannot describe a page that does not exist. The docs at `/docs` follow the same rule (`apps/website/scripts/docs.mjs`): package, CLI, install-order and config-seam pages are generated from READMEs, `package.json`, command doc comments and the registry — edit the source, never the page; hand-written pages (getting started, concepts, guides) show code only through `<!-- snippet: path#symbol -->`. `tests/architecture/docs.test.ts` fails on a stale page or snippet, a broken link, an API name that does not exist, or any reference to a decision record — those are the maintainers' private notes and never appear on the site. Deployed as static assets on Cloudflare Workers (root directory `apps/website`).

### Tools

- **`tools/film`** — the one-minute project film, a Remotion composition over a snapshot of the registry's own components (`pnpm --filter film sync-ui`). Not deployed, not published, rendered by a maintainer; what ships is the copy under `apps/website/public/film/`, which the homepage plays in the reader's theme and the README links its teaser from. Its README holds the script and the refresh commands. The rules that bind an app bind a tool: private manifest, published imports only, registered model ids.

## API Layer

Server Actions are thin transports over package services (installed `actions/*`): parse → service → map typed error (`TeamServiceError` etc.) to the UI shape → revalidate. Route handlers: `/api/chat` (two lines: `createChatHandler(chatServerConfig)` from `@intelligo-dev/chat` — auth, rate limit, feature gate, windowing, `executions.begin()`, persistence), `/api/assistant`, `/api/auth/[...all]` (`@intelligo-dev/next/auth`), `/api/webhooks/stripe`.

## Key Patterns

- **Ports over dependencies** — services take ports (`checkMemberLimit`, `onAccountDeleted`, `checkEntitlement`…); consumers bind them in `lib/*.ts`. auth never imports billing; core imports nothing; only `next` imports `next/*` (the request's headers reach the framework through `core/request-context`, bound once from the composition root).
- **The schema is one baseline** — `packages/core/src/db/migrations` starts at `0000_baseline`; a migration changes structure and never inserts or edits rows (a deployment's data comes from its composition root, e.g. `ensureBillingSettingsRow`). `legacy-chain.json` lets `intelligo migrate` adopt a database from before 1.0. `tests/architecture/baseline.test.ts` enforces it.
- **Model ids are registry keys** — every provider-prefixed literal must be registered with its pricing (`registerModels`, `@intelligo-dev/executions/pricing`). An unregistered id has no price: pricing throws `UnknownModelError` and chat admission refuses the turn as `unknown_model`; an architecture test enforces registration.
- **Tenant scoping** — every query filters `workspaceId` (+ `userId` where user-private); core services take resolved actor ids, transports gate with `requireWorkspace`/`requireRole` first.
- **Optimistic middleware, authoritative server** — middleware only redirects; real checks are server-side. Middleware never touches the DB.
- **`sessions.activeOrganizationId` exists** — workspace switching persists; always pass explicit `organizationId` to Better-Auth reads anyway.
- **RSC boundary discipline** — never pass component/function values from a server layout to client components (nav icons live in client-imported `lib/nav-config.ts`); `"use server"` files must not `export type`; next-intl's `redirect` takes `{ href, locale }`.
- **Platform admin is a row, not an env var** — `users.role`, seeded from `PLATFORM_ADMIN_EMAILS` on first use.
- **Input sanitization** — anything user-authored that reaches a system prompt (a stored summary, injected profile context) passes `sanitizeForSystemPrompt()` from `@intelligo-dev/core/prompt` at the concatenation point; `detectPromptInjection()` says what it saw, for the log. A product extends the pattern list rather than replacing the sweep.

## Conventions

- TypeScript strict; ESLint flat config; `_`-prefix for allowed unused vars.
- **TypeScript stays on 5.9 until the toolchain catches up.** 7.0 was tried across the tree and the compiler itself was fine — every package type-checked with zero errors. Two tools are not: `@typescript-eslint` **throws at plugin load** on 7.0 (`Error: typescript-eslint does not support TS 7.0`, every lint task dead — typescript-eslint#10940 tracks >=7.1), and `astro check` needs TypeScript's programmatic API, which the native compiler does not ship (withastro/roadmap#1321). Retry when both land. Worth knowing for that day: 7.0 rejects a side-effect `import "server-only"` without a declaration (TS2882), which Next's ambient types supply to every package that carries Next — `@intelligo-dev/admin` is the one that does not, and must not.
- **i18n via next-intl**: per-item namespaces under `messages/<locale>/<item>.json` (merged by filename in `i18n/request.ts`).
- Vitest: root projects config; mock `@ai-sdk/*` for CI; `vi.stubEnv` + `vi.resetModules` + dynamic import for module-load-time env; integration suites `describe.skipIf(!TEST_PG_URL)`.
- **Mutation testing** (`pnpm test:mutation`, CI job "Mutation score"): Stryker edits the source — an operator flipped, a string emptied — and reports what no test caught. `stryker.config.mjs` holds the scope and the breaking threshold; `vitest.stryker.config.ts` is its flat single-project vitest config (the root `projects` config loses per-mutant test selection) and lists the suites that can kill the scope's mutants, so the two grow together. A genuinely equivalent mutant gets a one-line `// Stryker disable next-line <mutator>: <why>` above it — the directive must be the last comment line — never a lowered threshold. **Vitest is held at `~4.1.11` for this**: `@stryker-mutator/vitest-runner` 10 still runs the suite under Vitest 5, but stops observing its failures, and the score collapses from 98.6% to 33.9% with nothing else changed — a silent loss of the signal, not a red build. Lift the pin when the runner ships Vitest 5 support.
- `pnpm.overrides` pins `pg` 8.18.0; the ajv floor is scoped `ajv@6` (shadcn needs ajv 8). Dependabot alerts on transitive packages are resolved there too — a `>=` floor, scoped to the major already in the tree (`js-yaml@4`, `^0.28.x`) where a newer major exists, never a forced major.
- **Comments say what the code does**, or why when the reason is not in the code — nothing else: no history ("used to", "moved"), no tracker ids or phases, no provenance, no labels. No comment beats a restating one. `tests/architecture/comments.test.ts` catches the common patterns.
- Conventional commits, small and scoped; repo stays green after every slice.

## Tech Stack

Next.js 16 (Turbopack), React 19, TypeScript 5.9, Tailwind CSS 4, shadcn/ui base-nova on Base UI (registry + consumer-owned primitives), Drizzle ORM, Neon PostgreSQL + pgvector, Better-Auth, Stripe, Resend, Vercel AI SDK 6, next-intl, Turborepo, pnpm 9, Vitest. Drizzle over Prisma; Better-Auth over NextAuth; no Redis; no Pinecone; no tRPC.
