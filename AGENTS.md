# AGENTS.md

## Project

**Intelligo** — open-source **application framework and operational platform** for vertical AI SaaS products (NOT a starter kit, NOT another AI framework). Turborepo monorepo with pnpm workspaces: the framework packages, the shadcn-compatible page registry, and a reference application that is the registry's canonical installed result.

**Decisions:** [docs/adr/](docs/adr/README.md) — read ADR-0003 (AI frameworks stay native), ADR-0005 (composition root), ADR-0007 (execution boundary), ADR-0009 (persistence contracts), ADR-0010 (i18n-native registry) before changing anything they cover.

## The boundary (read before writing code)

- Intelligo owns SaaS infrastructure: auth, workspaces/RBAC, entitlements, credits, billing, execution/usage/cost/audit records, conversation/document/identity persistence (ADR-0009), jobs, admin console, CLI, and the page registry.
- The developer owns the product: the AI framework used **natively** (no universal agent abstractions — ADR-0003), prompts, tools, workflows, product data, and every installed page as **consumer-owned source**.
- **Pages ship through the registry, not through packages.** `registry/` holds the source of the shadcn-schema items; `pnpm registry:build` emits `registry/public/r/*.json`; consumers install with the standard shadcn CLI. No runtime UI package is required to render them.
- **Installed items are used verbatim (ADR-0010).** Product variance flows only through consumer-owned config: `lib/shell-config.tsx` (banner, header-right), `lib/nav-config.ts`, `lib/chat-config.tsx` (agent identity, starters, headerRight, auto-continue), `lib/chat-renderers.tsx`, `lib/onboarding-steps.ts`, `lib/billing-config.ts` (product slug, credit bundles), `lib/workspace-bootstrap.ts`, `lib/document-patterns.ts` — and message files. Never edit an installed component; grow a seam in `registry/base/` instead.
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
pnpm registry:build   # shadcn build → registry/public/r/*.json
# Install an item (run INSIDE the consumer app, absolute artifact path —
# relative paths trip shadcn 3.8's unsafe-path check on (group)/ targets):
cd apps/app && pnpm exec shadcn add "$PWD/../../registry/public/r/<item>.json" --yes

# Database (drizzle-kit reads the repository-root .env)
pnpm db:push | db:generate | db:migrate | db:studio | db:check
```

Env: workspace apps load the **repository root `.env`** as fallback (app-local `.env` and shell win). Configure `DATABASE_URL` once at the root; `docker compose up -d` gives you a local Postgres with pgvector.

## Monorepo Layout

### Registry (`registry/`)

`registry.json` (official shadcn schema) + `base/<item>/**` source; build output `registry/public/r/` is gitignored. Items: smoke, app-shell, dashboard, auth-login/signup/password-reset/email-verification, onboarding, invitation-accept, workspace/team/profile/privacy-settings, pricing, checkout, billing-settings, usage, notifications, chat, artifacts, route-error. `tests/architecture/registry.test.ts` enforces: schema shape, no orphans, no private/deprecated/`@intelligo-dev/ui` imports, declared `@intelligo-dev/*` dependencies.

### Packages

| Package                       | Responsibility                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@intelligo-dev/core`         | DB schema (Drizzle + Neon + pgvector), email, logger, env, notifications, **conversations, documents, identity** (ADR-0009)                           |
| `@intelligo-dev/auth`         | Better-Auth multi-tenant workspaces, RBAC, `requireAuth/Workspace/Role`, typed `orgApi`, **team / workspace / profile / onboarding services** (ports) |
| `@intelligo-dev/billing-core` | Plan definitions, plan registry, payment provider interface                                                                                           |
| `@intelligo-dev/billing`      | Quota engine, credits, Stripe, feature gates, trials, rate limiting, **checkout + billing-overview service**                                          |
| `@intelligo-dev/executions`   | Execution lifecycle via ports (`createExecutions`), queries, `/pricing` model registry + cost math                                                    |
| `@intelligo-dev/audit`        | Append-only audit events + memory-audit contract                                                                                                      |
| `@intelligo-dev/jobs`         | Postgres-backed job queue                                                                                                                             |
| `@intelligo-dev/mastra`       | Optional bridge from a native agent to the execution boundary                                                                                         |
| `@intelligo-dev/admin`        | Operational console (Intelligo-owned, excluded from the registry)                                                                                     |
| `@intelligo-dev/cli`          | `create` / `add` / `doctor` / `migrate --check` / `upgrade --check`; scaffold is registry-ready (shadcn + Tailwind 4 + next-intl + composition root)  |
| `@intelligo-dev/ui`           | Legacy design system — still used by admin; **not** part of the page contract                                                                         |

`config/public-packages.json` is the allowlist of what is published; `tests/architecture/public-export.test.ts` audits it (licence metadata, no credentials, no deployment-specific identifiers).

### Apps

- **`apps/app`** — the canonical installed result and executable boundary check: a full generic workspace AI SaaS (signup → verify → login → shell → dashboard → team → billing → usage → notifications → chat with a stub model → artifacts) built ONLY from the packages + registry items, en-only, no Mastra installed. If a package change requires editing this app for a product reason, the boundary moved.

## API Layer

Server Actions are thin transports over package services (installed `actions/*`): parse → service → map typed error (`TeamServiceError` etc.) to the UI shape → revalidate. Route handlers: `/api/chat` (the registry chat item's generic transport — windowing, `executions.begin()`), `/api/assistant`, `/api/auth/[...all]`, `/api/webhooks/stripe`.

## Key Patterns

- **Ports over dependencies** — services take ports (`checkMemberLimit`, `onAccountDeleted`, `checkEntitlement`…); consumers bind them in `lib/*.ts`. auth never imports billing; core imports nothing.
- **Model ids are registry keys** — every provider-prefixed literal must exist in `MODEL_CONFIGS` (`@intelligo-dev/executions/pricing`). Unregistered ids silently run on the fallback model and bill wrongly; an architecture test enforces registration.
- **Tenant scoping** — every query filters `workspaceId` (+ `userId` where user-private); core services take resolved actor ids, transports gate with `requireWorkspace`/`requireRole` first.
- **Optimistic middleware, authoritative server** — middleware only redirects; real checks are server-side. Middleware never touches the DB.
- **`sessions.activeOrganizationId` exists** — workspace switching persists; always pass explicit `organizationId` to Better-Auth reads anyway.
- **RSC boundary discipline** — never pass component/function values from a server layout to client components (nav icons live in client-imported `lib/nav-config.ts`); `"use server"` files must not `export type`; next-intl's `redirect` takes `{ href, locale }`.
- **Platform admin is a row, not an env var** — `users.role`, seeded from `PLATFORM_ADMIN_EMAILS` on first use.
- **Input sanitization** — user strings pass `sanitizeForSystemPrompt()` before system-prompt concatenation.

## Conventions

- TypeScript strict; ESLint flat config; `_`-prefix for allowed unused vars.
- **i18n via next-intl**: per-item namespaces under `messages/<locale>/<item>.json` (merged by filename in `i18n/request.ts`).
- Vitest: root projects config; mock `@ai-sdk/*` for CI; `vi.stubEnv` + `vi.resetModules` + dynamic import for module-load-time env; integration suites `describe.skipIf(!TEST_PG_URL)`.
- `pnpm.overrides` pins `pg` 8.18.0; the ajv floor is scoped `ajv@6` (shadcn needs ajv 8).
- Conventional commits, small and scoped; repo stays green after every slice.

## Tech Stack

Next.js 16 (Turbopack), React 19, TypeScript 5.9, Tailwind CSS 4, shadcn/ui (registry + consumer-owned primitives), Radix, Drizzle ORM, Neon PostgreSQL + pgvector, Better-Auth, Stripe, Resend, Vercel AI SDK 6, next-intl, Turborepo, pnpm 9, Vitest. Drizzle over Prisma; Better-Auth over NextAuth; no Redis; no Pinecone; no tRPC.
