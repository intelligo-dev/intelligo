# Changelog

All notable changes to the Intelligo framework. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

Intelligo was built for seven months (February–August 2026) inside a
private incubation repository that also carried a production product.
That history is not published (ADR-0001), so this file is the record of
it. Versions **0.1–0.11** are the milestone tags that repository
carried; **0.12–0.15** are assigned here, after the fact, to the
untagged milestones that followed. None of them were released to npm —
**1.0.0-beta.1 is the first published version.** Product work that
happened alongside the framework is out of scope and noted only where
it explains a framework decision.

## [Unreleased]

### Fixed

- **`@intelligo-dev/billing`: purchased credits are spendable.** The
  Stripe checkout handler credited the legacy `balance` column;
  admission reads and settlement debits `balance_mnt`, so a customer's
  purchase showed on the billing page and was ignored by enforcement.
  Purchases now land in `balance_mnt` / `total_purchased_mnt`, the
  billing overview reports that column, and a real-database test
  drives purchase → admission.
- **`@intelligo-dev/billing`: one charge, one debit.** `recordTokenUsage`
  incremented the monthly allowance counter _and_ decremented the
  top-up (or trial) balance by the full charge; admission sums both
  pools, so a workspace holding both lost twice the charge per turn.
  Settlement now funds the plan allowance first and sends only the
  remainder to exactly one of trial / top-up; `monthly_usage.charged_mnt`
  is the allowance consumed, `usage_records.charged_mnt` the full
  charge. `recordTokenUsage` returns a `SettlementOutcome`
  (`chargedMnt`, `planMnt`, `topupMnt`, `trialMnt`) which the
  execution row records.
- **`@intelligo-dev/billing`: admission reads balances under the lock.**
  `checkQuota` read the balance snapshot before taking the
  per-workspace advisory lock, so a settlement landing in between let a
  second request pass against funds already consumed. The snapshot is
  now read after the lock, and settlement takes the same lock, so the
  window is closed. `checkQuota` without `requestId` is still a
  read-only estimate.
- **`@intelligo-dev/cli`: `intelligo migrate` applies by content hash, not
  by journal timestamp.** The framework's journal `when` values are not
  monotonic (entries 12–41 were hand-numbered below entry 11), and
  drizzle's migrator applies only entries whose timestamp exceeds the
  last applied row's — so on an already-migrated database a later
  hand-numbered migration was skipped silently while the CLI reported
  it applied. `migrate` now selects exactly the migrations `--check`
  reports pending, runs their statements in one transaction and records
  them in drizzle's own table with the journal's `when`, so records
  from either tool remain interchangeable. The CLI no longer depends
  on `drizzle-orm`.
- **`@intelligo-dev/admin`: impersonation can be stopped.**
  `stopImpersonation` required a platform-admin session, but during
  impersonation the cookie is the target's session; a non-admin target
  never passed, and the admin waited out the 30-minute cap. The stop is
  now authorized by the session's own `impersonatedBy` stamp, which is
  also the actor the audit event records; it refuses a session that is
  not impersonating and one impersonating a different user.
- **`@intelligo-dev/auth`: switching workspaces sticks.**
  `ensureUserWorkspace` set the first-listed workspace active on every
  authenticated render, undoing every switch as soon as the layout
  re-rendered. A valid active workspace is now kept; only a missing or
  stale one is replaced.
- **`chat` registry item: whole-run billing, abort accounting, no
  free turns.** The route read `result.usage` — the last step's usage,
  so a multi-step tool turn was billed for one step — and passed no
  `abortSignal`, so a closed tab ran the model to completion unbilled
  to anyone's benefit and could settle zero tokens as `succeeded`. It
  now captures `totalUsage` from streamText's `onFinish`, aborts the
  model with the request, settles the completed steps on `onAbort`, and
  fails (releasing the hold) if the stream ends without usage.
- **`intelligo create`: a fresh scaffold can chat.** The scaffold's
  feature matrix registered only `assistant`; the `chat` item gates on
  `chat` and an unregistered key is denied, so every message returned 403. `app-scaffold` 1.6.0 registers `chat` for every plan.
- **`intelligo upgrade --check` no longer misreports substituted files.**
  The manifest recorded hashes of placeholder-substituted content while
  the check hashed the raw template, so `package.json` and
  `lib/intelligo.ts` read `outdated` forever and `conflict` the moment
  the composition root was edited. The manifest now records the
  variables a feature was generated with and the check hashes the
  template as it would be written for that app.
- **`@intelligo-dev/core`: Neon deployments get a driver that can run
  transactions.** The client chose `drizzle-orm/neon-http` for any Neon
  URL. That driver has no session, so `db.transaction()` throws — and
  quota admission (advisory lock + reservation) and usage settlement
  are transactions, so every metered request on Neon was refused with
  a driver error. Neon URLs now use `drizzle-orm/neon-serverless`
  (WebSocket; Node 22's global `WebSocket` is picked up automatically),
  and `INTELLIGO_DB_DRIVER=pg | neon-serverless` forces a choice.
  `neon-http` is refused by name. Found by the Phase 1 documentation
  audit; the selection rule is now a pure, tested function.

### Added

- **`intelligo migrate`** applies the framework's migration chain with
  drizzle's migrator, into the default records table `migrate --check`
  reads; it refuses a push-provisioned database (tables, no records)
  and a database ahead of the checkout. The scaffold ships a
  `drizzle.config.ts` for the consumer's own chain (`__app_migrations`)
  and `db:generate` / `db:migrate` / `db:check` scripts.
- **`apps/site`** — intelligo.dev, the public site and the hosted page
  registry at `/r`, now lives in this repository; its content is
  generated from the tree by `pnpm --filter site sync`.

## [1.0.0-beta.1] — 2026-08-29

The first public release, published to npm under the `beta` dist-tag
as `@intelligo-dev/*`.

### What ships

- Eleven packages: `core`, `auth`, `billing-core`, `billing`,
  `executions`, `audit`, `jobs`, `mastra`, `admin`, `cli`, `ui` —
  Apache-2.0, ESM, TypeScript strict, each with unit tests and, where
  it touches money or tenancy, real-database integration tests.
- A shadcn-compatible page registry of 26 items, i18n-native and
  installed unmodified (ADR-0010).
- A reference application (`apps/app`) that is the registry's canonical
  installed result and CI's proof that a product can be built without
  touching a framework file.
- Ten architecture decision records and the architecture tests that
  enforce them.

### Changed

- **Package scope is `@intelligo-dev`.** Every package, import,
  registry dependency and CLI template moved from `@intelligo/*` to
  `@intelligo-dev/*`.
- `@intelligo-dev/core` ships its migration chain (`src/db/migrations`)
  in the tarball, and the CLI's `doctor` and `migrate --check` resolve
  it from a consumer's `node_modules` as well as from a framework
  checkout.
- The CLI reads its own version from its manifest; `intelligo create`
  emits `^<version>` for the framework dependencies of a scaffolded app.
- `@intelligo-dev/billing` no longer exports `./plugin-adapter`, whose
  source had already been removed.

### Fixed

- `deleteTrailingMessages` deleted the anchor message as well: it
  compared `created_at` against a JS `Date` the driver had truncated to
  milliseconds. The comparison now happens in SQL, and `saveMessages`
  stamps each row of a batch one millisecond apart so "the messages
  after this one" is well defined.
- `exportIdentity` records its own audit row before reading the trail,
  so an export contains the export.

### Infrastructure

- Release workflow: a `v*` tag publishes every package, with the npm
  dist-tag derived from the version (`-beta.N` → `beta`, plain → `latest`).
- Registry workflow: `registry/public` is built and served from GitHub
  Pages, so items install by URL.
- CI runs the real-database service suites in a dedicated job against a
  pushed schema, and the packed-package check caught the stale export
  above.
- Security floors raised through `pnpm.overrides` for `nanoid`, `hono`,
  `@hono/node-server`, `js-yaml` 3 and `ip-address`.

---

## Incubation history

### [0.15.0] — 2026-08-29 · V2: an application framework and operational platform

Two hundred commits, almost all in the last five days of August,
re-positioned the project from a product monorepo into a framework.
Everything a consumer touches today dates from here.

#### Decisions (ADR-0001 … ADR-0010)

- **0001** Intelligo is an application framework and operational
  platform, not a starter kit; the public repository starts from a clean
  commit.
- **0002** The consumer owns the application — routes, pages, AI code,
  product data; Intelligo supplies services, contracts and generated
  source. The `/admin/*` console is the one Intelligo-owned surface.
- **0003** No universal agent, tool, workflow or memory abstraction. AI
  frameworks are used natively; Intelligo records only the execution
  boundary.
- **0004** One PostgreSQL database with exactly one owner per table; the
  credit ledger is canonical.
- **0005** One service layer behind two thin transports (Server Actions,
  Route Handlers); one explicit composition root; import-side-effect
  registration is banned.
- **0006** Public / private / undecided package allowlists, kept in one
  file the audit and the extraction both read.
- **0007** The execution boundary is a lifecycle with ports, not a
  wrapper; terminal transitions are idempotent; unrecorded usage is
  never reported as success.
- **0008** `agents`, `ai` and `chat` dissolve into `executions`, `core`,
  `audit`, `jobs` and consumer source; none is published.
- **0009** Conversation and document persistence are public `core`
  capabilities.
- **0010** Registry items are i18n-native and installed unmodified;
  product variance flows only through consumer-owned config and message
  files.

#### Added

- **`executions`** — `createExecutions(ports)`; `begin(...)` takes the
  workspace, user, capability and model and returns a run handle with
  `complete()` / `fail()`. Ports `checkEntitlement`, `settleUsage`, `releaseHold` are
  optional: unbound, the lifecycle still records. The row is claimed
  before charging; `complete`/`fail` are idempotent compare-and-swaps;
  a settlement failure emits `execution.settlement_failed` and leaves
  the row `running`; a sweep reports abandoned runs. The
  `executions/pricing` leaf module holds the model registry
  (`MODEL_CONFIGS`, `ModelId`), per-token cost math, output budgets and
  the FX/margin defaults. Exercised against a real database.
- **`audit`** — append-only events with a Postgres trigger guard, the
  memory-audit contract, and `registerAuditSink` as the open-core
  extension point.
- **`jobs`** — Postgres-backed queue (`FOR UPDATE SKIP LOCKED`, retries,
  backoff) and failed-job views. No Redis.
- **`mastra`** — an optional structural bridge from a native Mastra
  agent to the execution boundary; `@mastra/core` is a peer that is
  never imported.
- **`admin`** — the `/admin/*` console behind a single platform-admin
  gate (`users.role`, seeded from `PLATFORM_ADMIN_EMAILS`): users and
  workspaces, credits, executions/usage/cost, audit activity, failed
  jobs, integration health, controlled and audited impersonation.
- **`cli`** — `create` (a registry-ready scaffold: shadcn, Tailwind 4,
  next-intl, a composition root wired to the execution boundary),
  `add`, `doctor`, `migrate --check`, `upgrade --check`. Generated files
  are tracked by content hash so an upgrade refuses to clobber what you
  customized.
- **`auth`** — ports-based team, workspace, profile and onboarding
  services with typed errors; the full invitation lifecycle with pre-
  and post-verification; sole-owner protection; ownership transfer;
  `sessions.activeOrganizationId`; platform admin separated from
  workspace owner.
- **`billing`** — atomic credit reservations (closing the quota
  check-then-charge race), per-bucket rate limiting, generic action
  quotas, and a checkout + billing-overview service shaped per role.
- **`core`** — public `conversations` and `documents` modules; the
  `identity` privacy module (`listFacts`, `deleteFact`,
  `exportIdentity`, `getAuditTrail`); a first-class Loops email provider
  behind a template seam; repository-root `.env` fallback.
- **Page registry** — `registry.json` in the official shadcn schema,
  sources under `registry/base/<item>/**`, built with the registry
  build script: smoke, route-error, app-shell, settings-shell,
  dashboard, auth-login, auth-signup, auth-password-reset,
  auth-email-verification, onboarding, invitation-accept,
  workspace-settings, team-settings, profile-settings,
  privacy-settings, pricing, checkout, billing-settings,
  feature-gating, payment-poll, usage, notifications, chat, artifacts,
  language-switcher, trial-banner. Consumer-owned seams:
  `lib/shell-config.tsx`, `lib/nav-config.ts`, `lib/chat-config.tsx`,
  `lib/chat-renderers.tsx`, `lib/onboarding-steps.ts`,
  `lib/billing-config.ts`, `lib/dashboard-config`,
  `lib/feature-catalog.ts`, `lib/workspace-bootstrap.ts`,
  `lib/document-patterns.ts`.
- **Reference app** — signup → verify → login → shell → dashboard →
  team → billing → usage → notifications → chat (stub model) →
  artifacts, built only from the packages and registry items; its bound
  seams are unit-tested and the product loop is walked in Playwright.
- `CreditBalance` and `MemberTable` in `ui` as the level between a
  service and a page.

#### Changed

- Chat runs through the execution boundary; usage is recorded even when
  the client disconnects.
- The model registry and cost math moved from `ai` to
  `executions/pricing` (a model id that ran on one provider and billed
  at another's rate is now an architecture-test failure).
- Product plan catalogues and feature matrices left the public billing
  packages; products register into the plan registry.
- Middleware no longer touches the database from the edge.
- The migration chain replays from an empty database.
- better-auth 1.4 → 1.6.
- **Breaking for registry consumers:** the dashboard item's `stat-card`,
  `recent-activity` and `quick-links` components were removed; the
  onboarding item's copy fields were renamed to `*Key` and answers now
  persist; CLI template features superseded by registry items are
  deprecated.

#### Removed

- `agents`, `ai`, `chat` are deprecated and dissolving (ADR-0008): never
  published, and no public package or registry item may depend on
  them — CI-enforced.
- Product-specific catalogue, payment stubs and seed scripts left the
  public packages.

#### Infrastructure

- Architecture tests: dependency direction, model-id registration,
  registry hygiene (schema shape, no orphans, no private or dissolved
  imports, declared dependencies, resolvable message keys), the
  public-export audit (licence metadata, governance files, no private
  vocabulary, no credentials, no deployment identifiers), protected
  routes, e2e project coverage.
- CI as a gate: typecheck, lint, unit and integration suites, `doctor`,
  packed-package compatibility, "a generated app builds and boots",
  every registry item installs into the generated app, formatting,
  migration-chain replay, `migrate --check` on an unmanaged database.
- Public extraction tooling: one allowlist, `scripts/extract-public.ts`
  with a whole-tree credential audit, and an overlay of public-only
  files. LICENSE (Apache-2.0), SECURITY, CONTRIBUTING, TRADEMARK,
  CODEOWNERS.

### [0.14.0] — 2026-06-30 · Concurrency safety and deployment

- Rate limiting rewritten as `INSERT … ON CONFLICT DO NOTHING` against a
  unique bucket constraint, removing the check-then-insert race; trial
  deduction simplified on top of it.
- `chat`'s `ToolPart` aligned with AI SDK 6 state handling; document
  actions take a version timestamp.
- Security headers emitted from the proxy middleware.
- OpenNext / Cloudflare Workers deployment scripts; `next-intl` 4.9.

### [0.13.0] — 2026-05-22 · Architecture-review remediation and `billing-core`

- **`billing-core`** extracted: plan definitions, the plan registry,
  the payment-provider interface and quota types; `billing` re-exports
  them.
- A `definePlugin()` plugin system in `core` with billing and chat
  adapters — later superseded by the explicit composition root of
  ADR-0005, but the origin of "registries are populated, never
  self-registering".
- Credit purchase via packs re-enabled; `WorkspaceRole` union type.
- Ad-hoc route handlers (document, suggestions, export) folded into
  server actions; the billing bootstrap side effect removed from the
  domain package.
- **Fixed:** the quota grace-period race (`FOR UPDATE`), an idempotent
  credit-purchase webhook, an atomic single-round-trip trial deduction,
  double workspace creation on signup, the Stripe API version,
  cost-based quota-threshold notifications; `as any` casts replaced
  with typed interfaces.
- RAG ingestion parallelised through `embedBatch`, an LRU on
  `embedText`, HNSW on `rag_documents`, composite and partial indexes on
  extraction queues and member lookups.
- Probabilistic rate-limit cleanup replaced by a scheduled route; CI
  runs the test suite.

### [0.12.0] — 2026-04-30 · Packages, cost-based billing, and a security sweep

- **`agents`** extracted from the application (later dissolved): memory
  and identity API, conversation windowing, prompt sanitizer, retry,
  tool middleware, five built-in tools; a renderer registry in `chat`.
- **Identity graph** in `core`: `user_facts`, `user_memories`
  (pgvector), `user_profile_snapshots`, and an append-only
  `user_memory_audit` enforced by Postgres triggers; a RAG layer with
  `rag_documents` and a `Collection` abstraction.
- **Cost-based billing in a configurable local currency**: a
  `billing_settings` table caching FX rate and margin, cost columns on
  usage records, a tested gross-margin invariant, trial credits with
  deduct/active-check helpers, cost-based `checkQuota`, a per-request
  usage audit with 30-day rollups and a cross-workspace admin view with
  a margin-drift validator.
- Feature-based quota enforcement and a generic plan registry so
  products register their own plans; a payment-provider interface with
  a mock provider; `withAuth()` / `withRole()` route wrappers; a typed
  wrapper over Better-Auth's organization plugin; `document_types` and
  `documents.metadata`.
- Logger moved to pino, all server-side `console.*` routed through it;
  `cn()` consolidated in `ui/utils`.
- **Security (thirty-plus fixes):** tenant scoping pushed into SQL
  `WHERE` clauses across conversation, document, suggestion, export and
  persistence paths; auth and membership checks on invitation
  accept/reject; Zod on payment bodies; magic-byte upload verification
  with sanitized names and randomized paths; CSP without `unsafe-eval`
  in production; PII scrubbed from every Sentry event with the logger's
  redact list; constant-time `CRON_SECRET` comparison and length floors
  on secrets; Stripe webhook metadata capped; credit balances floored
  with `GREATEST`; emails normalized before the trial-abuse check;
  prompt-injection sanitization at every system-prompt concatenation;
  cron and mock-payment guards; email-verification gating only when a
  provider is configured; Dependabot advisories patched.
- **Performance:** React Compiler enabled and manual memoization
  removed; artifact editors and markdown lazy-loaded; a 60 s
  `hasFeature` cache invalidated on checkout; the four `checkQuota`
  reads parallelised; streamed messages persisted in one
  order-preserving upsert; `DISTINCT ON` and batch updates in hot
  queries; Suspense boundaries around usage pages.
- Vitest workspace merged into one root config with a first wave of
  unit tests (auth helpers, feature quota, chat middleware, persistence,
  webhooks, validators, every server action) and a shared Drizzle mock;
  Playwright scaffolding; `docker-compose.yml` with pgvector; CI on
  Node 22 with `globalEnv` declared in `turbo.json`.

### [0.11] — 2026-03-20 · Image generation helper

- `generateImage()` in `ai` over an AI SDK image model (size and quality
  options, base64 result).
- A per-agent monthly session quota — the third quota kind after tokens
  and generations.
- Route `maxDuration` raised to 300 s for long tool pipelines; legacy
  agent scaffolding removed from the repository.

### [0.10] — 2026-03-19 · Batch quotas

- `checkGenerationQuota(…, count)` for batch generation; trending and
  seasonal columns on image tools; the cron-authenticated route pattern
  reused for a scheduled recalculation.
- Next.js `cacheComponents` enabled; a seed default model corrected to a
  registered id.

### [0.9] — 2026-03-19 · Generation quota and image hardening

- A generation quota module in `billing` (daily, per plan, reset at UTC
  midnight, failed generations excluded, separate from token billing).
- `image_tools` and `image_generations` schema; `agents.product_type`.
- `validateImageUpload` (size cap, MIME allowlist, decode check) and
  `stripExif` on every uploaded and generated image.
- `billing` joins the Vitest workspace.

### [0.8] — 2026-03-19 · The package split

Includes the untagged "0.7 Architecture & Security" milestone.

- **`auth`**, **`billing`**, **`ai`** and **`chat`** extracted from
  `core`. `ensureUserWorkspace` took an `onWorkspaceCreated` callback so
  auth never imports billing — the origin of "ports over
  dependencies". `core` slimmed to db, email, notifications, logger and
  env; `ui` reduced to a shadcn-only design system with a `tokens.css`
  design-token layer; the dead `types` package deleted.
- Cost-aware usage recording: `calculateCost(model, tokens)` and a
  `usage_records.cost` column; credit deductions became model-aware.
- Embedding helpers `embedText()` / `embedBatch()`; an HNSW index on
  knowledge chunks; `user_profiles`; agents gained `feature_key` and
  `color` so gating, navigation and onboarding are data-driven.
- **Security:** `workspace_id` on documents and suggestions with every
  read filtered by workspace (closing a cross-workspace access hole);
  `detectPromptInjection()` / `sanitizeForSystemPrompt()` applied before
  system-prompt concatenation; strict chat request metadata; feature
  gating on the chat transport.
- Vitest across packages (46 tests), Sentry (client, server, edge) and a
  zero-dependency structured analytics event.

### [0.6] — 2026-02-21 · Internationalization, agents as data, onboarding

Includes the untagged "0.5 Polish & i18n" milestone.

- next-intl with a `[locale]` route segment, middleware composed with
  Better-Auth, localized email templates, Stripe `preferred_locales`.
- An `agents` table (bilingual copy, prompt key, model, tools, base
  path) replacing static configuration; conversation windowing with
  LLM summarization; a four-step onboarding wizard with trial
  provisioning on completion.
- Chat UI simplified (votes and visibility removed), per-product
  sidebar navigation, reduced-motion skeletons, per-route loading and
  error boundaries.

### [0.4] — 2026-02-17 · Trials, flags and production hardening

- A 14-day trial lifecycle with expiry processing, warning and expiry
  emails and a cron route; 5% grace overage; feature flags read from the
  database; a checkout-success page that tolerates the webhook race.
- Fail-fast env validation from a Next `instrumentation` hook,
  `/api/health`, security headers, error boundaries, a structured
  logger with PII redaction, soft-deleted accounts refused at sign-in.
- Webhooks always answer `202`; token usage awaited so serverless
  functions never exit mid-write.

### [0.3] — 2026-02-10 · The SaaS core

Includes the untagged "0.2 Core Platform" milestone.

- Drizzle over Neon PostgreSQL with migrations; Better-Auth with the
  Drizzle adapter, and its **organization plugin as multi-tenant
  workspaces** — personal workspace auto-provisioned by a database hook,
  workspace-scoped query helpers, switcher, team and invitation flows.
- Stripe: plans, subscriptions, credit balances and purchases, Checkout
  and Customer Portal, and **webhooks made idempotent through a
  `finance_events` ledger**.
- A transactional quota engine, trial credits with per-email and per-IP
  abuse limits, database-backed sliding-window rate limiting, and a
  composable auth → rate-limit → quota guard.
- Email provider abstraction (Resend, Loops, console) with React Email
  templates; notifications with history; feature flags with
  `FeatureGate` and `UpgradePrompt`.
- AI SDK 6 with a `provider/model` registry, a conversation and
  knowledge schema on pgvector with an HNSW index, a streaming chat
  transport, and an artifacts system (text, code, sheet, image) in
  `ui`.

### [0.1] — 2026-02-06 · Foundation

- Turborepo and pnpm workspaces; `core`, `ui` and `types` package
  skeletons; shadcn/ui and Tailwind; GitHub Actions running build,
  type-check and lint.

[1.0.0-beta.1]: https://github.com/intelligo-mn/framework/releases/tag/v1.0.0-beta.1
[0.15.0]: #0150--2026-08-29--v2-an-application-framework-and-operational-platform
[0.14.0]: #0140--2026-06-30--concurrency-safety-and-deployment
[0.13.0]: #0130--2026-05-22--architecture-review-remediation-and-billing-core
[0.12.0]: #0120--2026-04-30--packages-cost-based-billing-and-a-security-sweep
[0.11]: #011--2026-03-20--image-generation-helper
[0.10]: #010--2026-03-19--batch-quotas
[0.9]: #09--2026-03-19--generation-quota-and-image-hardening
[0.8]: #08--2026-03-19--the-package-split
[0.6]: #06--2026-02-21--internationalization-agents-as-data-onboarding
[0.4]: #04--2026-02-17--trials-flags-and-production-hardening
[0.3]: #03--2026-02-10--the-saas-core
[0.1]: #01--2026-02-06--foundation
