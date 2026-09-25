# Changelog

All notable changes to the Intelligo framework. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

Intelligo was built for seven months (February–August 2026) inside the
original private repository, which also carried a production product.
That history is not published, so this file is the record of
it. Versions **0.1–0.11** are the milestone tags that repository
carried; **0.12–0.15** are assigned here, after the fact, to the
untagged milestones that followed. None of them were released to npm —
**1.0.0-beta.1 is the first published version.** Product work that
happened alongside the framework is out of scope and noted only where
it explains a framework decision.

## [Unreleased]

### Added

- A fixed price per unit of work: `executions.begin({ …, price })` holds
  exactly the price, `complete()` charges it (a `fixed_charge` usage row),
  `fail()` releases it, and `reconcile()` settles a stuck run at it. The
  price is a typed input of the lifecycle — `EntitlementRequest.price` and
  `UsageSettlement.price` in `@intelligo-dev/executions`, kept on the
  execution as `price_micros` — which the billing ports honour.
  `estimateQuota`/`reserveQuota` take `{ amount }`; `recordFixedCharge`
  settles one.
- `refundCharge(workspaceId, requestId, { reason, amount?, actorId? })` and
  `creditWorkspace(workspaceId, amount, { reason, requestId, actorId? })` in
  `@intelligo-dev/billing`: credit to the top-up balance, visible in the
  ledger, as a `credit` usage row with a negative charge and as a
  `billing.refund`/`billing.credit` audit event — not as an execution. One
  refund per charge; concurrent calls with one key credit once. Both throw
  `ChargeError` for an amount the ledger cannot take.
- `checkRateLimit(subject, { limit, windowMs, endpoint })`: any subject (a
  hashed IP) over any window of whole seconds, aligned to the Unix epoch in
  UTC. The three-argument form is unchanged.
- `creditBundleOffer(bundle)`: a credit bundle as the offer the
  `lib/local-payment.ts` seam returns, grant and price as `Money`.
- `intelligo create --name <name>`: the project name — package name,
  billing product, page title — when it is not the directory's.
- `intelligo create --name <name>`: the project's name when it is not the
  directory's; its slug becomes the package name, the billing product and
  the default page title.
- The scaffold writes a `.gitignore`. Under pnpm, an app outside any
  workspace also gets the `pnpm-standalone` feature: a `pnpm-workspace.yaml`
  that declines the dependency build scripts pnpm 11 stops the install over
  (10 warns) and allows the shadcn CLI's `pnpm add` at the root, and an
  `.npmrc` saying the same to pnpm 9. `intelligo add pnpm-standalone` refuses
  inside a workspace member. The consumer smoke installs with these settings.
- The scaffold's `next.config.mjs` fills in env variables from the enclosing
  pnpm workspace's `.env.local` and `.env` when `create` made the app as a
  member of one (`__WORKSPACE_ROOT__`, decided by the rule `doctor` and
  `migrate` use); the reference app uses it unchanged.
- `intelligo doctor` accepts a composition root that calls
  `setDefaultProductSlug()`, warns when `INTELLIGO_BILLING_PRODUCT` names
  another product than the root (the root wins at runtime), and warns about
  a vitest config whose runner resolves from nowhere above the app.
- `shellConfig.onboardingRedirect` in the `app-shell` item's
  `lib/shell-config.tsx` seam: where a user who has not finished
  onboarding is sent, or `false` for a product without an onboarding
  step (the layout then skips the query). A seam written before the
  field existed compiles unchanged and keeps `/onboarding`. The path must
  be outside `(app)`, or the layout redirects to itself.
- A plan card can offer the QR payment rail. The `pricing` item ships a
  `lib/plan-card-config.tsx` seam whose `actions` component renders under
  the checkout button of every plan the caller can buy, with the plan, the
  interval, the shown price and the plan's name; it is empty by default.
  The `payment-poll` item ships `LocalPaymentButton`, which opens
  `LocalPaymentModal` for one reference and refreshes the page once paid.
  Binding the button in the seam offers QR payment on the pricing page
  without editing an installed file, and the pricing item still installs
  without payment-poll.
- The `chat` item's sidebar history no longer logs Base UI's "expected a
  native <button>" console error on every authenticated page: its
  new-chat `Button` renders a `Link` and now passes
  `nativeButton={false}`. `tests/architecture/design-system.test.ts`
  fails when a native-button Base UI component (`Button`, or a dialog,
  sheet, popover, menu or select trigger/close) renders a `Link` or a
  non-button element without `nativeButton`.

### Changed

- Migration `0004_usage_subjects` is additive — the previous release's
  code keeps working on the migrated database — and **must run before the
  deploy**: this release writes `executions.price_micros` and
  `rate_limit_entries.window_seconds`. `usage_records.user_id` becomes
  nullable and `rate_limit_entries` drops its foreign key to `organization`.
- A custom `ExecutionPorts.settleUsage` must honour the new
  `UsageSettlement.price`: one that ignores it charges a fixed-price run for
  its tokens. With both a `price` and a `model`, the price wins for the hold
  and the charge; the usage row still records the model, tokens and provider
  cost.
- `begin` with a `requestId` an earlier attempt used — a refused one
  included — throws `ExecutionError` with code `request_id_taken` instead of
  the database's unique violation, after releasing the hold.
- **Breaking:** `RecordUsageParams.userId` and the admin's
  `UsageByUserRow.userId` are `string | null`.
- `getUsageSummary`'s per-model breakdown and the admin's `getUsageByModel`
  count work that ran on a model, fixed-price runs included, and leave
  credits out; its per-agent and daily counts leave credits out too.
  `monthly_usage.request_count` counts fixed-price runs, and their tokens
  count toward `tokens_used` and the token totals. `listUsageRecords` names
  each row's `type` and audits the charge of token-priced rows only;
  `getUsageByUser` leaves credits out.
- `intelligo add app-scaffold` wrote `__APP_NAME__`, `__APP_SLUG__` and
  `__INTELLIGO_DEP__` unreplaced; `add` now refuses any feature whose
  placeholders only `create` fills, before writing anything.
- **Breaking:** every command refuses a flag it does not know
  (`sync --chek` used to apply); a script passing flags a command never
  read now exits 2. `--help` prints the usage from any command, and `sync`
  takes item names comma-separated as `create --items` does.
- `intelligo create .` works in a directory that holds only `.git`.
- `create` records the chosen items in `intelligo.manifest.json` before
  installing, and `sync` treats a file the scaffold wrote and nobody edited
  as the registry's to replace, so a bare `intelligo sync` finishes a
  declined or failed install.
- `intelligo add` re-generates a feature with the values it was first
  generated with, so `add app-scaffold` works in an app `create` made.
- The scaffold's `dev` and `start` scripts no longer pin port 3000.
- Unset optional env variables are one boot warning, not one each.
- `intelligo add admin-page` (template 1.2.0) writes a page styled with
  the app's tokens instead of inline `system-ui`, shows integration
  health and operations beside the overview, answers a caller who is not
  a platform admin with the app's 404, and renders each screen whose read
  fails as unavailable instead of failing the page. Its header says where a
  product adds its own sections; the consumer smoke builds it.

### Fixed

- `intelligo add app-scaffold` in an app `create` did not make wrote
  `__APP_NAME__`, `__APP_SLUG__` and `__INTELLIGO_DEP__` unreplaced; `add`
  refuses a feature whose placeholders it cannot fill, before writing.
- `app-scaffold` changed under template version 1.14.0, so the upgrade
  check showed a changed template with no newer version; it is 1.15.0,
  and a test pins each template version to its content.
- The scaffold's `transpilePackages` names `@intelligo-dev/jobs`, and its
  comment no longer says the packages ship TypeScript source.
- `intelligo create .` works in a directory that holds only `.git`.
- Every command refuses a flag it does not know (`sync --chek` used to
  apply), `--help` works on each, and `sync` takes item names
  comma-separated as `create --items` does.
- `create` records the chosen items in `intelligo.manifest.json` before
  installing, so a bare `intelligo sync` installs them after a declined
  or failed install.
- The scaffold's `dev` and `start` scripts no longer pin port 3000.
- Unset optional env variables are one boot warning, not one each.
- A run with no user failed settlement on the `usage_records.user_id`
  foreign key: the billing ports passed `""` where no user existed.
- `cleanupExpiredReservations` compared a local-time `Date` with a naive
  UTC column, and `cleanupRateLimitEntries` now compares in UTC too.
- **`intelligo doctor`, `migrate` and `upgrade` read the workspace root's env
  files.** An app inside a pnpm workspace whose database URL lives in the
  repository root's `.env` was reported as missing `DATABASE_URL` and
  `BETTER_AUTH_SECRET` although it booted. `loadAppEnv` now also loads the
  enclosing workspace root's `.env.local` and `.env`, below the app's own files
  and the shell.
- The `trial-banner` item renders the same credit counts on the server
  and in the browser. It formatted them with compact notation inside
  the client component, so Node's ICU spelled them during SSR and the
  browser's at hydration; for locales where the two disagree, React
  reported a hydration mismatch and regenerated the tree.
  `TrialBannerContainer` now formats the counts on the server and
  `TrialBanner` takes them as strings (`creditsRemaining`,
  `initialCredits`). An app that renders `TrialBanner` directly passes
  formatted strings instead of numbers.
- **`intelligo doctor` no longer requires a feature key only a seam names.**
  `requires.json` derived an item's `features` from every file it ships,
  config seams included, so the `chat` item required `"chat"` in
  `lib/plans.ts` because its default `lib/chat-server-config.ts` gates on
  it — an error for an app that owns that seam and gates on another key.
  `features` now comes from the files `intelligo sync` overwrites only
  (the `chat` item declares none), and doctor instead warns when an app's
  own copy of a seam names a literal `featureKey` `lib/plans.ts` does not
  register.

## [1.0.0-beta.14] — 2026-09-24

### Added

- `intelligo sync [items…]` keeps installed registry pages the
  registry's. It installs each item with `shadcn add --overwrite` from
  the registry bundled with the CLI — the pages of the same release as
  the packages — in `requires.json` order, puts the item's seams back,
  merges message files key by key (the app's copy wins), and records
  each installed file's hash in `intelligo.manifest.json`. It refuses to
  overwrite a hand-edited file without `--force`. `intelligo sync
--check` installs nothing and exits 1 on any file that is missing,
  edited, outdated or lacks registry message keys. An existing app
  overwrite a hand-edited file without `--force`.
  `intelligo sync --check` installs nothing and exits 1 on any file that
  is missing, edited, outdated or lacks registry message keys. An existing app
  adopts it by naming its items once.
- `@intelligo-dev/cli` ships the built registry (`templates/registry`).
- `requires.json` names every item's `seams`: the files an item ships
  once for the deployment to own. The site's config-seams page, the
  reference-app drift test and `sync` read them from there.
- `createBillingExecutions()` / `billingExecutionPorts()` in
  `@intelligo-dev/billing`: the execution boundary bound to the quota
  engine, which every composition root used to copy. The scaffold uses it.
- `grantPlan({ workspaceId, planSlug, reason, actorId })` in
  `@intelligo-dev/billing`: a plan as a product decision (a reward, a
  grant), without writing `subscriptions` directly. Stripe state is left
  alone.
- `applyRate(cost, rate)` in `@intelligo-dev/executions/pricing`:
  `chargeFor`'s arithmetic over a recorded cost, for audits.
- `@intelligo-dev/admin`: `getProviderCostTotal`, `getUsageByModel`,
  `getUsageByUser`, `getPlanDistribution`, `listUsageRecords` (each
  record's charge audited with `applyRate`). Amounts are `Money`.
- `profile.setPreferredLanguage(locale)` in `@intelligo-dev/auth`, and
  the `profile-settings` item's `updatePreferredLanguage` action,
  checked against `routing.locales`.
- `turn.state` in `@intelligo-dev/chat`: a `Map` that lives for one
  request and is shared by every seam that receives the turn
  (`resolveAgent`, `prepareMessages`, tools, `streamTurn`, `persist`,
  `onTurn`), so what one seam reads the next can reuse.
- `turn.addUsage(usage, { model, capability })`: tokens a tool spent on
  another registered model are summed per model and recorded as that
  model's own execution (`capability` `"chat.embedding"` for an embedding
  model, `parentExecutionId` in its metadata) when the turn settles or
  fails. Without `model`, or with the turn's own, usage folds into the
  turn as before. An unregistered `model` throws `UnknownModelError` at
  the call.
- `ModelPricing.kind` (`"chat" | "embedding"`, default chat) and
  `modelKind()` in `@intelligo-dev/executions/pricing`. Admission for an
  embedding model holds only the input budget.
- `DEFAULT_MODELS` prices three embedding models:
  `openai/text-embedding-3-small` ($0.02/M input tokens),
  `openai/text-embedding-3-large` ($0.13/M) and
  `google/gemini-embedding-001` ($0.15/M).
- `saveProfileSnapshot(actor, input)` in `@intelligo-dev/core/identity`:
  stores a synthesized profile in `user_profile_snapshots`, one row per
  user per workspace, bumping `version` atomically and writing a
  `snapshot` audit row in the same transaction.
- A "Skip to content" link, visible only when focused, is the first
  focusable element of the `app-shell`, `auth-login` and `onboarding`
  layouts; each wraps its page in a `main#main-content` landmark
  (`tabIndex={-1}`) and carries the copy as `skipToContent`.
- The `notifications` item ships a new seam, `lib/notification-types.tsx`:
  a map from a product's notification `type` to its `{ icon, className }`,
  empty by default and consulted before the built-in types.
  `workspace_invitation` notifications get their own icon.
- Plan copy is translatable. A deployment names each plan's `name`,
  `description` and `features` per locale in a `plans` message namespace
  (`messages/<locale>/plans.json`, keyed by plan slug); the `pricing`,
  `billing-settings` and `usage` items read it through the pricing
  item's `lib/plan-copy.ts` and fall back to the catalogue's strings for
  any key a locale leaves out. The pricing item ships an empty
  `messages/en/plans.json`.
- `@intelligo-dev/next` ships the transport toolkit: `ActionResult<T>`,
  the `{ success, data } | { success, error }` shape a Server Action
  returns, and the `./route` subpath's Route Handler guards `withAuth`,
  `withWorkspace` and `withRole(roles, …)`, which resolve the caller
  through `requireAuth` / `requireWorkspace` / `requireRole` and answer
  a failed check as JSON (`401` unauthenticated, `403` no workspace or
  forbidden) without catching anything the handler throws.
- `openLocalInvoice({ workspaceId, userId, reference, price })` and
  `settleLocalInvoice({ invoiceId, workspaceId, fulfil })` in
  `@intelligo-dev/billing`: a QR-and-poll payment through the registered
  `PaymentProvider`, recorded in the new `payments` table at the price
  the server decided. Settling asks the provider that issued the
  invoice; a paid one is marked fulfilled and its grant (`{ plan }` or
  `{ credits: Money }`) applied in one transaction, once however many
  polls see it. Another workspace's invoice is `payment_not_found`; a
  paid amount other than the invoiced one is `payment_mismatch`.
  `getPaymentProviderFor(mode)` and `currentPaymentMode()` resolve the
  provider an invoice was opened with.
- `@intelligo-dev/core`: the `payments` table (migration
  `0003_local_payments`; `intelligo migrate` applies it).
- `getRevenue()` in `@intelligo-dev/admin`: gross revenue per currency
  as `Money[]` — every paid Stripe invoice, every paid one-time Stripe
  checkout (a delayed method by its `async_payment_succeeded`), and
  every paid local invoice. A subscription's checkout is counted
  through its first invoice, not twice; refunds and fees are not
  subtracted.
- `intelligo sync --check` reports `locale-behind`: for every locale
  in `i18n/routing.ts` besides `en`, each shipped namespace's
  `messages/<locale>/<item>.json` is compared with the app's English
  file on disk, and a missing file or missing keys fail the check with
  the keys named.
- `intelligo add vitest`: a `vitest.config.ts` with the `@` alias, a
  `server-only` stub at `tests/stubs/server-only.ts`, and
  `test.server.deps.inline` for the `@intelligo-dev/*` packages, whose
  compiled ESM imports `server-only` where a Vite alias cannot reach it
  otherwise. It prints the devDependency and script to add. A feature in
  `templates/manifest.json` can now carry `nextSteps`, printed by `add`.
- Docs: a "Testing your app" guide, and `docs/migrations/1.0.0-beta.14.md`
  — the upgrade from `1.0.0-beta.6`, in the order it is executed,
  including the features that left the framework and where each now
  lives in the app.

### Changed

- `NotificationType` in `@intelligo-dev/core/notifications` is open:
  `BuiltInNotificationType | (string & {})`, so a product creates its
  own notification types without a cast. `BuiltInNotificationType` names
  the framework's own.
- **Breaking:** `getBillingOverview()` returns `planName: null` for a
  workspace with no plan instead of the English `"Free"`; `planSlug`
  stays `"free"`. The `billing-settings` item renders its own translated
  `freePlan` label.
- Every registry item's actions type their results with
  `ActionResult` from `@intelligo-dev/next` and declare the package; the
  item-specific names (`ProfileActionResult`, `TeamActionResult`, …)
  remain as aliases. `InvitationActionResult`'s success carries
  `data: undefined` like the others.

- `apps/app` is regenerated with `intelligo sync` instead of a
  hand-written `shadcn add` loop.
- The reference app's web-search tool reports its tokens against the
  model it ran on, so a turn on another model no longer prices them at
  the turn's rate.

### Fixed

- `@intelligo-dev/auth`'s invite schema uses `{ message }` instead of
  zod 4's `{ error }`, which zod 3 — still inside the peer range —
  ignored. An architecture test keeps zod-4-only params out of packages
  whose peer range admits zod 3.
- The `payment-poll` item's seam `lib/local-payment.ts` answers one
  question: `priceLocalPayment(reference)` returns `{ price, grant }`
  (or null for a reference not sold this way). It replaces
  `createLocalPayment` and `checkLocalPaymentStatus`; the item's actions
  call `openLocalInvoice` / `settleLocalInvoice` themselves, and resolve
  the caller's workspace with `requireWorkspace`. An installed seam
  keeps compiling only once it exports `priceLocalPayment`.

- A local (QR-and-poll) payment that completed granted nothing and was
  recorded nowhere: `pollLocalPayment` reported `paid` and the modal
  called a client-side `onPaid`, so what was bought depended on the
  browser. The grant now happens on the server when a poll sees the
  invoice paid, and the payment is a `payments` row.
- The composition-root concept page says why composing once in
  `instrumentation.ts` is enough: registries live on `globalThis` per
  process, so no module needs an "ensure composed" import; the Edge
  runtime is its own scope and composes separately.
- `intelligo create` installs the pages it offers through
  `intelligo sync`: one `shadcn add` per item, dependencies first, from the
  registry bundled with the CLI rather than the hosted one, recorded in
  `intelligo.manifest.json`. A failure leaves a known set installed and
  prints the sync to re-run.
- `intelligo create` inside a pnpm workspace that includes the new app
  runs the dependency install from the workspace root instead of
  starting a nested lockfile in the app.
- Scaffold files a registry install replaces (`app/globals.css`,
  `components/shell/theme-provider.tsx`, `lib/utils.ts`…) move to the
  `app-scaffold` entry's `handedOver` list, so `upgrade --check` stops
  reporting them `customized` and `add app-scaffold` leaves them alone.

- `intelligo doctor` reads what an app exports the way the compiler
  would: comments are stripped before matching, `export type` /
  `export interface`, `export { a as b }` and `export { x } from "…"`
  count, and `export * from "…"` is followed into the module it
  resolves to (relative, `@/`, or a package through node resolution
  from the app root) — one it cannot read is a warning, not an error.
  Feature keys match `key:` or `"key":` only outside comments, and a
  `lib/plans.ts` that re-exports its catalogue from a workspace package
  is checked against that package's file.
- `intelligo migrate`, `migrate --check` and the core migrations README
  no longer tell a database that ran part of the pre-1.0 chain to finish
  it with `@intelligo-dev/core@1.0.0-beta.7`, a version that was never
  published. The messages name the migrations it has not run (also
  `legacyMissing` in `--json`), say that `1.0.0-beta.6` ships the chain
  only through `0042`, and point at the README's three ways forward:
  apply the missing SQL from your own copy, bring the schema to the
  baseline and record it, or start from the baseline.

## [1.0.0-beta.13] — 2026-09-21

The first version on npm since `1.0.0-beta.6`. `1.0.0-beta.7` to
`1.0.0-beta.12` were versioned but never published, and their sections
below are part of this release. The code is `1.0.0-beta.10`'s.

### Fixed

- The release's consumer check installs registry items under pnpm 9: the
  app it scaffolds accepts `pnpm add` at its root. `1.0.0-beta.12`
  stopped there.

## [1.0.0-beta.12] — 2026-09-21

Versioned but never published; it reached npm as `1.0.0-beta.13`.

### Fixed

- The release workflow runs the packed CLI with the dependencies its
  manifest declares; `1.0.0-beta.11` stopped where `create` imports its
  prompt library from a tarball extracted without them.

## [1.0.0-beta.11] — 2026-09-21

Versioned but never published; it reached npm as `1.0.0-beta.13`.

### Fixed

- A release from a hand-pushed `v*` tag runs: the release workflow's test
  step receives the vocabulary list the publishability test requires on
  a push build. `1.0.0-beta.10` stopped there.

## [1.0.0-beta.10] — 2026-09-21

Versioned but never published; it reached npm as `1.0.0-beta.13`.
`1.0.0-beta.7`, `1.0.0-beta.8` and `1.0.0-beta.9` were not published
either — the public repository's CI lacked a secret, so no release ran.
The code is `1.0.0-beta.9`'s; what this version adds is how the
packages present themselves.

### Changed

- Every package's README shows the package in use: a working call, what
  it guarantees, and the peers and tables it needs. Each opens with the
  manifest's description and links its page on `intelligo.dev/docs`,
  which is also the package's npm homepage.
- `@intelligo-dev/core`'s README lists `/attachments` and `/storage`,
  and the environment check.

### Fixed

- `@intelligo-dev/billing` no longer calls `Array.prototype.at`, which
  the ES2020 library the packages compile against does not declare.

## [1.0.0-beta.9] — 2026-09-20

Versioned but never published; it reached npm as `1.0.0-beta.13`.
`1.0.0-beta.7` and `1.0.0-beta.8` were not published either: their
sections below belong with this one, which is what the tree became
while their releases were failing. The repository is now public at
`intelligo-dev/intelligo`.

### Breaking

- **Auth guards throw `AuthGuardError`** with a `code`
  (`unauthenticated`, `no_workspace`, `forbidden`);
  `requireWorkspace()` with no session is `unauthenticated`.
  `requireFeature` throws `FeatureNotAvailableError`.
- **An unregistered model id is an outage, not a paywall:** chat answers
  503 `MODEL_UNAVAILABLE` instead of 402 `QUOTA_EXCEEDED`.
- **The workspace bootstrap is set from the composition root** with
  `setWorkspaceCreatedHandler`, and runs for the workspace signup
  creates; the app-shell layout no longer passes it.
- `deleteWorkspace` takes a `beforeDeleteWorkspace` port
  (`cancelWorkspaceSubscription` is billing's binding);
  `checkRateLimit` takes a bucket.
- `migrate` refuses an unknown flag instead of applying.
- `finance_events.claimed_at` (migration `0002`): run
  `intelligo migrate`.

### Added

- `turn.addUsage()` on the chat turn: a tool that calls a model itself
  hands over its tokens, and the turn settles them with its own.
- `intelligo create` asks which pages to install and installs them with
  the shadcn CLI once approved (`--items`, `--all`, `--yes`,
  `--no-install` for scripts).
- The team page can leave a workspace and transfer it.
- `updateBillingSettings()` changes rate, margin or currency after first
  boot; `ensurePlanRows()` writes the plans table from the registered
  catalogue.
- `doctor` checks model ids, secret strength and a localhost app URL in
  production; `migrate --check --json` names the database's state.
- One radius scale on a 0.5rem radius; `ai-markdown` loads maths and
  diagram support only when a reply has them.

### Fixed

- **Money.** Settlement is idempotent per request under the workspace
  lock, so `reconcile()` cannot charge twice; a client that disconnects
  is still charged; a turn is charged on the model admission priced;
  provider cost and margin are exact integer micros. Entitlement
  follows the subscription's status and Stripe price; a Stripe event is
  marked processed only after its handlers succeed, behind a claim
  lease; a canceled subscription is never reopened by a late event;
  delayed payments settle a credit purchase once.
- **Tenancy.** Request headers are scoped with AsyncLocalStorage — the
  shared slot handed one caller's cookie to concurrent requests.
  `PLATFORM_ADMIN_EMAILS` promotes only a verified address;
  impersonation checks both caller and target; pending invitations
  count as seats.
- **Chat.** A refused turn keeps the reply it would have regenerated;
  an approval must match the tool call the model proposed; client
  system messages are refused; uploads over the limit are refused
  before their body is read.
- **Jobs.** A failing job stops at `maxAttempts`; a job abandoned
  mid-run is claimed again.
- **A new app works end to end:** the composition root seeds the plan
  and billing-settings rows before the first request and retries a
  failed seed; the scaffold registers team seat limits, declares its
  peers, and has a tsconfig `next dev` does not rewrite.
- Installed pages keep the reader's work (onboarding saves the last
  step, invitations survive sign-in), and show translated errors.

### Changed

- Every package's `repository`, `homepage` and `bugs` point at
  `github.com/intelligo-dev/intelligo`.
- core and chat no longer peer zod, admin no longer peers react-dom,
  billing no longer depends on next or tsx.
- A release publishes only from its own release commit, after an app
  scaffolded outside the monorepo from the packed tarballs installs
  every registry item, type-checks, builds and boots.

## [1.0.0-beta.8] — 2026-09-18

The framework's schema becomes one baseline that describes structure and
nothing else, and the interface moves the way its AI parts always did.

### Breaking

- **The migration chain is one baseline.** `@intelligo-dev/core` ships
  `0000_baseline` in place of the 48 migrations that grew before 1.0, and
  `0001_reconcile_chain_built_databases`. Nothing is seeded any more: no
  document types, no billing row.
  - **Upgrading a database that ran the old chain:** run
    `intelligo migrate`. It recognises the old chain by its hashes
    (`legacy-chain.json`), records the baseline as applied without
    running it, and applies `0001`, which brings the few places where the
    old chain and the schema disagreed into line (`conversations.metadata`
    to jsonb, the invitation and finance-event foreign keys, three
    indexes). A database that ran only part of the old chain is refused:
    finish it with `1.0.0-beta.7` first.
- **Tables the framework no longer owns** are gone from the schema and
  from new databases: `competitions`, `competition_entries`,
  `shared_reports`, `user_profiles`, `ee_audit_chain`, `image_tools`,
  `image_generations`, `knowledge_articles`, `knowledge_documents`,
  `knowledge_chunks`, `document_types`, `suggestions`, `referral_codes`,
  `referrals`, `rag_documents` and `pending_extractions`, with the
  `agents.product_type` and `documents.type_id` columns. No framework
  code read them. An adopted database keeps them untouched; a product
  that uses them declares them in its own schema and migrations.
- **Billing is USD until a deployment says otherwise.** Schema defaults
  and the fallbacks in `getBillingSettings` are USD at 1.0; the old
  tugrik defaults are gone. `ensureBillingSettingsRow(config)` now
  replaces the row the old chain seeded (MNT at 3450, 4×) with the
  composition root's configuration; any other existing row is still
  left alone.
- The primitives animate with `motion/react` (ADR-0018): popover,
  dropdown menu, select, tooltip, dialog, alert dialog and sheet keep a
  controlled root internally, so their exit plays; installing one now
  installs `@intelligo/ai-motion` and `motion`. The API is unchanged.
- The `app-shell` item runs on `ai-sidebar` instead of the stock shadcn
  sidebar, and the chat history follows. `shell-config` and
  `nav-config` keep their shape.

### Added

- Registry items `popover-morph`, `select-morph`, `morphing-modal`,
  `notification-stack`, `animated-list`, `otp-input`, `file-upload`,
  `expandable-tabs` and `hold-action-button`.
- The chat renders replies in `ai-streaming-response`, the working line
  in `ai-reasoning-text`, running subagents with `ai-agent-progress`,
  and ships `FileDiffCard` and `ImageGenerationCard` tool renderers.
- Pages stagger in, the notification bell stacks unread notifications,
  deleting a workspace is held rather than clicked, onboarding steps
  slide.

### Fixed

- `intelligo migrate`, `doctor` and `upgrade` read the app's `.env.local`
  and `.env`, so the quickstart's `pnpm db:migrate` works as written.
- A scaffolded app has a root page: signed in to the dashboard,
  otherwise to login.
- Email verification is required exactly when an email provider is
  configured; production without one warns instead of locking every
  new account out.
- A scaffolded app loads Geist; every surface used to fall back to the
  system face.
- `resetMonthlyQuota` names the deployment's currency instead of relying
  on a column default.

### Changed

- Comments say what the code does, or why; history, tracker ids and
  provenance are gone from the source, and the licences of adapted
  registry code live in `packages/registry/LICENSES.md`.
- Install commands name `@beta`; `engines` is `node >=22.14`; the stripe
  peer range includes 22.

## [1.0.0-beta.7] — 2026-09-16

The chat at ChatGPT level on one runtime seam, one design
system, and a framework that no longer speaks one product's
language.

### Breaking

- The `chat` item is rewritten: `components/chat/chat-panel.tsx` becomes
  `chat-thread.tsx` (`ChatThread`, with page / panel / widget variants),
  `lib/chat-renderers.tsx` entries are `{ component, label, canvas }`
  with the full action set (`sendMessage`, `addToolResult`,
  `addToolApprovalResponse`, `openCanvas`, `closeCanvas`), and the item
  depends on shadcn's `questionnaire`, `resizable`, `sheet`,
  `hover-card` and `command`, on `motion`, Streamdown's math and
  mermaid plugins and the canvas editors. Reinstall it.
- `@intelligo-dev/chat`: `ChatTurnContext` gains `write` and
  `updateMetadata` (a custom `agent.tools` function receives them);
  `model.resolve` is optional when `streamTurn` is set; a continuation
  body must name the assistant message it continues; an edited turn
  trims the persisted path it replaces.
- `@intelligo-dev/core`: migration `0043_attachments` (stored
  attachments); `listConversations` projects `metadata`.
- `app-shell`: the shell is one screen tall and `main` scrolls inside
  it. A shell that grew with its page scrolled the window, which left
  the chat composer below the fold and the transcript with nothing to
  scroll; a page that relied on the window scrolling now scrolls `main`.
- `chat`: the page no longer renders its own history column. History
  lives in the shell's sidebar — bind `ChatHistory` as `sidebarContent`
  in `lib/shell-config.tsx`.
- Registry T3: `ai-task`, `ai-approval`, `ai-chain-of-thought`,
  `ai-sources`, `ai-inline-citation`, `ai-image` and `ai-tool` are
  removed — `ai-todo-list`, `ai-tool-approval` / `ai-approval-card`,
  `ai-agent-activity`, `ai-citations`, a plain image and
  `ai-tool-result` replace them; the `chat` item no longer depends on
  shadcn's `bubble`, `message`, `message-scroller` or `questionnaire`.
- **Money is micros with the currency attached.** Every
  amount in a public type is now `Money` from `@intelligo-dev/core/money`
  — micros (millionths of a major unit) plus an ISO code — because a
  bare number whose unit lived in a field name is what showed one
  Gemini Flash turn as "$15" on the usage page, and what let a $5
  credit pack grant 100,000 units of a currency nobody had named.
  - `executions`: ports and `ExecutionRun` gain `estimated` / `charged`
    beside the deprecated `estimatedMnt` / `chargedMnt`;
    `summarizeExecutions` and `summarizeExecutionsByDay` return
    `charged: Money[]`, one entry per currency, rather than summing
    two currencies into one number. `providerCost`, `chargeFor`,
    `estimateWorstCaseCharge`, `DEFAULT_MARGIN_BP` and
    `PROVIDER_CURRENCY` are added; `calculateChargedMnt`,
    `estimateWorstCaseChargedMnt` and `DEFAULT_USD_TO_MNT_RATE` are
    deprecated and go next release.
  - `billing`: `ResolvedBillingSettings` is a `BillingRate`
    (`currency`, `usdRateMicros`, `marginBp`), and
    `ensureBillingSettingsRow` takes it — a deployment declares what it
    bills in, and there is no default exchange rate.
    `SettlementOutcome` and `QuotaCheckResult` gain typed amounts,
    `PlanConfig.monthlyAllowance` replaces `limits.monthlyCreditMnt`,
    and `CreditBundle` is `{ grant, price }`: what the workspace
    receives and what the buyer pays, in their own currencies. Stripe
    is charged in the price's currency, and the webhook refuses to
    credit a grant the ledger is not denominated in.
  - `admin`: `chargedMnt24h` → `charged24h: Money[]`.
  - Migration **0044** adds micros and currency columns across the
    billing and execution tables and backfills existing rows as MNT at
    ×1,000,000. Run `intelligo migrate` before deploying this release.
    The old columns are still written and read; a later release drops
    them.
- Registry: `chat` and `artifacts` now draw documents through one
  `@intelligo/document-viewer` item, and `artifacts` no longer depends
  on `@intelligo/ai-code-block`. Reinstall both. `DocumentActions`
  gains required `title` and `kind` props — a download has to know
  what it is saving.
- `app-shell` ships `TimeZoneCookie`, which records the reader's IANA
  zone, and the CLI scaffold's `i18n/request.ts` returns it as
  next-intl's `timeZone`. Reinstall `app-shell` and take the scaffold
  change; without them every date on every page stays UTC.
- `@intelligo-dev/core`: `DocumentListItem` gains
  `conversationId: string | null`, read from the row's `metadata`.
  Harmless to read — but anything that _constructs_ one (a test double,
  a preview fixture) has to supply it.
- **Migration 0045 drops the money columns 0044 replaced**, and with
  them the last of the surface that named an amount after a currency.
  `credit_balances`, `credit_purchases`, `finance_events`,
  `credit_reservations`, `usage_records`, `monthly_usage`,
  `trial_credits` and `executions` lose their `*_mnt` columns, the
  legacy cents columns that predated even those, and
  `billing_settings.usd_to_mnt_rate` / `margin_multiplier_bp`.
  - **The deploy order is the reverse of 0044.** That migration was
    additive, so it ran first; this one is destructive, so deploy the
    code that has stopped writing these columns and _then_ migrate.
    Running it under the old code breaks inserts immediately —
    `credit_reservations.estimated_mnt` was NOT NULL with no default.
    The migration refuses to run at all if 0044 has not: `DROP COLUMN
IF EXISTS` would otherwise delete amounts nothing had copied.
  - Not dropped: `trial_credits.initial_credits`, `credits_used` and
    `credits_remaining`. Those count tokens rather than money, 0044
    never replaced them, and retiring them would change what a trial
    _is_ rather than what it is denominated in.
  - `executions`: `calculateCost`, `calculateChargedMnt`,
    `estimateWorstCaseChargedMnt`, `DEFAULT_BILLING_MARGIN`,
    `DEFAULT_USD_TO_MNT_RATE` and `ChargedAmount` are gone —
    `providerCost`, `chargeFor`, `estimateWorstCaseCharge` and
    `DEFAULT_MARGIN_BP` replace them, and the 65% gross-margin floor is
    pinned against the new constant. `EntitlementDecision.estimatedMnt`
    and `SettlementResult.chargedMnt` are gone; bind `estimated` and
    return `charged`. `summarizeExecutions` and
    `summarizeExecutionsByDay` no longer report `chargedMnt`.
  - `billing`: `ResolvedBillingSettings` is exactly a `BillingRate`;
    `QuotaCheckResult` and `SettlementOutcome` lose their `*Mnt`
    fields; `PlanLimits.monthlyCreditMnt` and `getPlanMonthlyCreditMnt`
    are gone (declare `PlanConfig.monthlyAllowance`, and an allowance
    in a currency the settings row does not name now reads as zero
    rather than being silently converted); `TrialConfig.initialCreditsMnt`
    becomes `grant: Money | null`; `hasActiveTrialMnt` becomes
    `getActiveTrialGrant`; `formatPrice` is gone. Admission and
    settlement do their arithmetic on amounts now, where the split used
    to be decided in whole tugrik and the typed values derived from it
    by ratio. `getQuotaThresholds` also returns `usedMicros` and
    `limitMicros`, so the quota email reads them from the one place
    that computes them.
  - `admin`: `chargedMnt24h` is gone; read `charged24h`.
  - Registry: `usage`'s `UsagePeriodSummary` and `UsageRecord` lose
    `chargedAmount`, `dashboard`'s `PlanSummary` loses
    `chargedThisMonth`, and `billing-settings` renders the top-up
    balance as an amount — `getBillingOverview` returns
    `creditBalance: Money | null` and `CreditBundles` takes
    `currentBalance` where it took a count of "credits". Reinstall the
    three items.
  - `tests/architecture/money-migration.test.ts` keeps the shape from
    coming back: no schema column named for a currency, and no
    identifier ending in `Mnt` in a published package.
- **The framework stops speaking one product's language.** A public
  framework greeted every consumer in Mongolian, and the publishability
  rule that should have caught it matches a list of private names with
  no language check at all. `@intelligo-dev/billing` loses `referral.ts`
  — a named growth program exported as public API, whose
  `grantReferralUpgrade` also picked a workspace with `.limit(1)` and no
  `ORDER BY` — along with `generation-quota.ts`, an image quota for a
  route that does not exist here whose limit function returned 0 for
  every plan, and the dead `seed-plans.ts`. `PlanConfig` drops the
  required `descriptionMn` and `featuresMn`; `checkFeatureQuota` returns
  `nearingLimit: boolean` where it returned a `warning` string it
  composed itself, because the sentence belongs to whoever owns the
  voice. `@intelligo-dev/core`'s nine email templates lose their
  `locale?: "en" | "mn"` prop and its hardcoded branch — `senders.ts`
  never passed a locale, so that branch was unreachable — and
  `BilingualText = { en, mn }` becomes
  `LocalizedText = Record<string, string>` across six JSONB columns. It
  is a `$type`, so no migration.
- `payment-poll`: `startLocalPayment` no longer takes `amount`, and
  `LocalPaymentRequest` no longer carries one. The action forwarded the
  browser's number to the payment provider, three lines under a doc
  comment explaining that this is exactly why the parameter is not in
  the signature. Your binding prices `reference` server-side.
- `@intelligo-dev/core`: `getAttachment`, `getAttachments`,
  `attachToConversation` and `setExtractedText` take the full actor and
  filter `userId` beside `workspaceId`. Conversations are user-private
  and the ids arrive in the request body, so a workspace-only
  scope traded a colleague's attachment id for a signed URL to their
  upload. `deleteAttachment` always filtered both.
- `@intelligo-dev/executions`: `listExecutions` requires `workspaceId`.
  Omitting it applied no filter, so the default reading of the
  executions table was every tenant's rows.
- **A quota row is per (user, workspace).** `user_quotas` carried
  `UNIQUE` on `user_id` alone, so someone who belongs to a paid
  workspace and a free one shared a single row between them: whichever
  wrote last set `plan`, both then read the other's limits, and the
  per-action counters in `usage` were the sum of everything that person
  did anywhere — the free tenant enforcing the paid tenant's allowance,
  every action counted twice. Migration `0046_user_quotas_per_workspace`
  replaces the constraint with a unique `(user_id, workspace_id)`, and
  `recordFeatureUsage` takes `workspaceId` as its second argument.

### Added

- `@intelligo-dev/chat`: **`agent.generation`** — how the model samples
  a turn (temperature, `maxOutputTokens`, `topP`/`topK`, penalties,
  `stopSequences`, `seed`, reasoning effort, `maxRetries`, `headers`,
  `toolChoice`, `prepareStep`, `telemetry`, `experimental_transform`,
  `onStepEnd`). Until now the `streamText` call was a closed literal, so
  setting `temperature` meant taking `streamTurn` and re-implementing
  the whole model call plus its usage promise. It is an allowlist, not a
  pass-through: the options settlement depends on — `abortSignal`,
  `onFinish`/`onEnd`, `onAbort`, `model`, `messages`, `tools`,
  `stopWhen` — stay the transport's, enforced by the type, by a runtime
  filter and by key order in the call. The one-agent `agent` shorthand
  is now derived from `ResolvedAgent`, so `stopWhen`, `activeTools`,
  `modelId`, `maxSteps`, `capability` and `featureKey` no longer require
  writing a whole `resolveAgent`. `ChatGenerationOptions`,
  `ChatAgentConfig` and `ProviderOptions` are exported.
- `@intelligo-dev/chat`: `streamTurn` (a Mastra agent, an eve session
  — the transport keeps auth, gate, admission, persistence and
  settlement), the `data-chat-*` parts vocabulary and `ChatUIMessage`
  on `/client`, `createArtifactWriter`, `models` (allow-list, plan
  gate), `sources`, `messageMetadata`, `cors`, `GET` (204) and
  `OPTIONS`, stored attachments (`createChatUploadHandler`,
  `createChatAttachmentHandler`, signed URLs for the model only),
  `sanitizeForShare`, `recordChatFeedback`, `onTurn.approval` and
  `onTurn.feedback`.
- `@intelligo-dev/core`: the storage port (`setStorageAdapter`,
  `createMemoryStorage`), the `attachments` service,
  `updateConversationMetadata`, `setConversationVisibility`,
  `getPublicConversation`, `getPublicMessages`, `clearVote`,
  `getDocumentVersions`.
- Registry: the `chat` item with edit, regenerate and response versions,
  message actions and feedback, attachments, a model picker, voice,
  slash commands and @ mentions, citations, approvals, tasks, agent
  activity for Mastra parts, a canvas beside the chat (text, code,
  sheet, image; versions; consumer-owned kinds), a sidebar with pinned
  and dated groups, rename, pin, delete with undo and keyboard
  navigation, a share dialog; `chat-panel`, `chat-widget`, `chat-share`
  and `chat-eve` items; T3 parts `ai-branch`, `ai-chain-of-thought`,
  `ai-task`, `ai-approval`, `ai-inline-citation`, `ai-image`,
  `ai-speech-input`, `ai-composer-menu`, `ai-shimmer-text`.
- `tests/architecture/design-system.test.ts`: a file that animates with
  `motion` must read `useReducedMotion`.
- `packages/registry` has a vitest project (the eve mapper, the
  composer's trigger detection).
- `@intelligo-dev/core/money` is finally the module the framework
  denominates in, and gains `displayFractionDigits`: an amount shows
  the currency's own decimals, except when that would render a real
  charge as nothing — one chat turn costs a fraction of a cent, and a
  usage page saying every request cost `$0.00` is worse than one saying
  `$0.0048`.
- Registry: `pricing` ships `lib/format-money.ts`, the one place an
  installed page turns an amount into a string (its decimals come from
  `Intl`, not a currency table). The `usage` and `dashboard` items
  render through it, so a deployment's figures read in the currency it
  actually bills in. `usage`'s action returns `charged` per period and
  per record.
- `packages/core/src/db/__tests__/migration-money.int.test.ts`: the
  0044 backfill converts a tugrik ledger at exactly a million micros to
  the unit, and a second run changes nothing.
- money
  is micros with a currency attached, a deployment declares the one it
  bills in, there is no default exchange rate, and a grant and a price
  are separate amounts.
- `@intelligo-dev/chat`: `agent.providerOptions` (and
  `ResolvedAgent.providerOptions`) reach `streamText` as-is — a thinking
  budget, `includeThoughts` — which is what makes `reasoning: true`
  show a model's thoughts.
- `app-shell`: `shellConfig.sidebarContent`, rendered under the
  navigation (it may be an async server component). `chat`:
  `ChatHistory` and `ChatHistoryNav` for it — recency groups, pinned,
  search, rename, pin, delete with undo, the open conversation
  highlighted from the URL; the first reply of a new conversation
  refreshes it. `ai-message-scroller`: a scroll-to-latest control, and
  `anchor`, which brings the reader back to the end when they send;
  following is decided by scroll direction, so a long smooth scroll or
  content growing under the reader no longer drops it.
- `app-shell`: the header carries an empty `shell-header-slot` a page
  can fill, and its separator is centred. The `chat` item's conversation
  bar (agent, title, rename, share, delete) renders into it, so a
  conversation has one header, not two; the loading skeleton follows.
  The canvas text editor spells out its typography (the theme ships no
  typography plugin, so lists had lost their numbers), and the preview
  rail stays off on a phone.
- `chat`: the agent's work reads as one activity stream. Reasoning and
  the tool calls between the reply's words fold into a single
  `ai-agent-activity` run — live while it works, then one line
  ("Searched the web ▸") — instead of a stack of cards with their JSON
  open. A call with a `query` renders as a search with its results; the
  raw input and output sit under a row the reader opens.
  `lib/message-parts.ts` holds the layout rules (tested).
  `TOOL_RENDERERS` entries gain `activity` and `sources`, `component`
  is optional (a tool without one is a row, a tool with one keeps its
  card), and `label` is finally read. `ai-agent-activity` rows take
  `status` and `details`; `ai-tool-approval` is a lighter card, and a
  decided call joins the stream from the part's own state, so the
  decision survives a reload.
- `chat`: sources read like the sites they are. A `[3]` in the reply
  is an inline pill with the site's favicon and domain (`+2` for
  adjacent markers), previewing its sources on hover, as soon as the
  search behind it settled; a finished reply ends with a favicon stack
  and a count that opens every source in a sheet. Sources come from the
  AI SDK's source parts and from tool outputs (`output.sources`, or a
  renderer's `sources`), numbered by the tool when it numbers them.
  `ai-citations` adds `CitationPill`, `CitationSources` and
  `CitationCard` and depends on `hover-card` and `sheet`. The reference
  app's `webSearch` resolves Google's grounding redirects to the pages
  themselves and numbers its sources across the conversation.
- `chat`: a document reads as a document. One `ArtifactCard` serves the
  tool's card and the streamed part: the kind's glyph, the title, what
  it is ("Code · py"), the whole card opens it, and while it is written
  the last lines arrive under a fade (from the tool's input, or the
  canvas's stream through `ArtifactStreamProvider`); a running document
  tool no longer draws a second card for the part it streams. The
  canvas header is two quiet rows — glyph, title, kind and state with
  expand and close; then a preview/code switch (HTML and SVG render in
  a sandbox), a `‹ 2 / 3 ›` version stepper with restore, copy,
  download, and "Open in Artifacts", which now lands on the document
  (`/artifacts?document=<id>`). The panel no longer draws a double
  border, the reader drags its edge (or uses the arrow keys) to resize
  it, and it can fill the page. `CanvasKind` gains `icon`, `labelKey`,
  `preview`, `previewable` and `extension`; `chat-canvas-config` exports
  `extensionOf`, `languageOf` and `fileNameOf`.
- Registry T3, ported from an MIT-licensed agents set onto Base UI and the token contract: `ai-motion` (easings,
  springs, `Disclosure`, `SwapText`), `ai-message`, `ai-message-bubble`,
  `ai-message-scroller` (reader-aware, preview rail), `ai-todo-list`,
  `ai-agent-activity`, `ai-streaming-response`, `ai-citations`,
  `ai-tool-result`, `ai-file-diff`, `ai-tool-approval`,
  `ai-approval-card`, `ai-image-generation`, `ai-reasoning-text`,
  `ai-agent-progress`, `ai-sidebar`; `ai-code-block` (stable streaming
  rows, focused lines, header), `ai-prompt-input` (one rounded field,
  auto-growing textarea, morphing send/stop) and `ai-shimmer-text`
  (token gradient sweep) are rewritten in place. The `chat` item draws
  turns without avatars — a solid bubble for the reader, plain text for
  the assistant — and scrolls, plans, asks and seeks approval through
  the new parts.
- Registry: the `artifacts` item shows a document the way it was
  written — markdown (math, diagrams) for text, highlighted code with
  line numbers for code, rows for a sheet, the image itself — inside a
  dialog that scrolls instead of spilling; the reference app's
  `saveArtifact` tool takes `kind: "text" | "code"` so the model can
  save source as source.
- Registry: `@intelligo/document-viewer`, the one place a saved
  document is drawn. `chat` and `artifacts` had each grown a copy of
  the extension table and the kind switch, and the copies had drifted:
  the library's had lost `htm` and `svg`, its `languageOf` took
  whatever followed the last dot (so an untitled note was looked up as
  a language), and the two rendered markdown through different plugin
  sets. Exports `DocumentView` and the read-only views, `extensionOf`,
  `languageOf`, `fileNameOf`, `isPreviewableTitle`, `documentKindIcon`
  and `documentKindExtension`. Editing stays with the chat's canvas,
  and each item keeps its own words for a kind.
- Registry: the `artifacts` library leads with the documents. A card
  shows the opening lines (or the image) under a fade instead of a
  title over an empty body, the filters are one segmented control
  carrying counts, and the reader is wide, with the canvas's two-row
  header, a preview/source switch for HTML and SVG, download, and a
  link back to the conversation that wrote it.
- `@intelligo-dev/core`: `saveDocument` takes an optional
  `conversationId`, stored on the row's `metadata`. Every save writes a
  new version, so a known conversation is carried forward — otherwise
  editing a document in the canvas silently unlinked it from its chat.
- `@intelligo-dev/core/request-context`: `resolveTimeZone(value)` — an
  IANA zone arrives from a browser cookie, so it is caller input:
  anything this runtime does not know becomes `UTC`.
- `@intelligo-dev/executions`: `summarizeExecutionsByDay` takes
  `{ timeZone }`, defaulting to UTC, so existing callers are unchanged.
- Tests: `queries-timezone.int.test.ts` (UTC, New York and Ulaanbaatar
  split the same three rows three different ways, against real
  Postgres) and documents integration tests for the conversation link
  surviving a new version.

### Fixed

- **`ResolvedAgent.activeTools` had done nothing since the AI SDK 7
  upgrade.** The SDK dropped the `experimental_` prefix in 7.0 and the
  transport kept passing `experimental_activeTools` — a key the
  compiler accepts inside a conditional spread and `streamText` drops
  into its rest parameter, so it failed silently rather than loudly. An
  agent that named a subset of its tools ran with all of them. If you
  set `activeTools`, it now takes effect; the transport's tests assert
  the model is offered only the named tools.
- The usage page rendered "Usage unavailable" for every workspace.
  Drizzle inlines a `sql` fragment once per clause, so binding the time
  zone turned one grouped expression into three different placeholders
  and Postgres refused the grouping; the query groups by ordinal now.
- Days were bucketed in UTC, so anyone east of it saw a chart that
  ended yesterday and their late-evening turns filed on the day before.
  `started_at AT TIME ZONE $zone` does not convert a naive timestamp —
  it declares it — so the pair `AT TIME ZONE 'UTC' AT TIME ZONE $zone`
  is what reads the stored instant where the reader sits, and the
  period window is computed in that zone too.
- The usage chart's date labels disagreed between the server and the
  browser whenever they sat in different zones, which React reports as
  a hydration mismatch. The day string is already the reader's calendar
  day, so it is parsed and formatted as UTC rather than projected
  through a zone a second time.
- The dashboard composer painted only its pill, so while the page
  scrolled the plan card and the shortcut row showed through the band
  around it. Starter cards were fixed at `h-28`, which put a one-line
  suggestion in a tall empty box, and the resume pill wrapped into a
  block on a phone.
- `privacy-settings` was written as a standalone page and kept its own
  container and a second `h1` inside the settings shell, so the tab was
  narrower than its siblings and titled twice; `profile-settings` was
  the only other tab constraining its own width.
- The notifications list titled itself in every variant, so the page
  read "Notifications" twice, one line apart. Only the bell dropdown
  names itself now.
- Pricing: the interval switch stretched across the content column as
  two large tabs, the plan grid was hard-coded to three columns (two
  plans hung against the left edge), and "Current plan" was a disabled
  default fill, which reads as the page's primary action greyed out.
- The workspace URL helper printed the stored slug back instead of the
  address it produces, and did not follow what was typed.
- The team owner's role badge was the solid primary fill, which in a
  table of members reads as an alert rather than as a role.
- The artifact reader rendered at 384px however wide it asked to be.
  `DialogContent`'s classes end with `sm:max-w-sm`, and tailwind-merge
  keeps an unprefixed `max-w-*` beside it as a different variant group,
  so the responsive rule won above 640px — which is also why the
  previous `max-w-2xl` never applied.
- **`@intelligo-dev/chat` did not resolve from npm at 1.0.0-beta.6.**
  `publishConfig.exports` replaces `exports` wholesale at publish time,
  and core's copy was missing `./attachments` and `./storage`. Both
  resolve in the workspace, neither resolved from the tarball, and
  nothing looked — the workspace never reads `publishConfig`. The
  architecture suite now asserts the two maps agree.
- Stripe's credit branch granted before checking `payment_status`.
  Delayed-notification methods fire `checkout.session.completed` while
  the money is still in flight; `async_payment_succeeded` is the event
  that says it arrived.
- Two unauthenticated remote-code-execution advisories: `next` moves to
  `~16.3.5`, since 16.2.x is affected and both are patched in 16.3.3.
  Floors also rise for `sharp`, `nodemailer`, `browserslist`,
  `baseline-browser-mapping`, `@humanfs/node` and
  `postcss-selector-parser`, each scoped to the major already in the
  tree. `pnpm audit` goes from ten advisories to one.
- `main` had not type-checked since the money slice: the site's credit
  card still passed `currentCredits` to a component that had taken a
  typed `currentBalance` since that commit. The formatting gate was
  failing on 106 files, and `packages/registry/base/ui/` now joins the
  prettierignore beside the installed copies it is the source of —
  formatting one side of that pair breaks the reference app's
  byte-for-byte check.
- The migration chain is frozen at 47 rather than 44. The unmanaged
  database the freeze was written for holds no data, so the baseline it
  waited on protects nothing, and every push had been failing that step.
- Documentation that stated counts the tree contradicts: the README
  claimed twenty-five page families and listed nineteen of
  twenty-eight, the site hardcoded the one registry count `pnpm sync`
  does not generate, and `architecture.astro` listed ten ADRs beside
  the "15 decisions" the same page rendered.
- Stripe's success and cancel URLs were built from the `Host` header,
  which is whatever the client sent. A forged one points the
  post-payment redirect — carrying `{CHECKOUT_SESSION_ID}` — at another
  domain. `NEXT_PUBLIC_APP_URL` is used when it is set, and the header
  stays as the fallback for a deployment that has not set it.
- `getBillingSettings` fell back to the shipped tugrik defaults whenever
  the database read threw, so one transient outage billed a USD
  deployment at an MNT rate for as long as it lasted. An expired reading
  of the real row is still right about the currency, so it prefers that
  and reaches the defaults only when it has never read one.
- The CLI scaffold still wrote `descriptionMn` and `featuresMn` into
  `lib/plans.ts`, which is why a generated app stopped compiling the
  moment those fields left `PlanConfig`.

### Design system

One design system.

#### Breaking

- Registry items require shadcn `base-nova` (Base UI): they compose with
  `render`, not `asChild`, and depend on the `intelligo` token contract.
  See `docs/migrations/design-system.md`.
- `@intelligo-dev/ui` is no longer used by the framework; the admin
  console dropped it.
- The chat item is rebuilt on MessageScroller, Message, Bubble and the T3
  AI parts; its seams keep their names and shapes.

#### Added

- `intelligo.dev/r/intelligo.json`: the `registry:base` preset — base-nova,
  a WCAG AA-checked neutral theme, status, layer and motion tokens.
- T3 AI parts (prompt input, reasoning, tool, code block, sources,
  suggestion, artifact) and T4 patterns (page header, stat card, status
  badge, copy button) as `@intelligo/<name>` registry components.
- `tests/architecture/design-system.test.ts`: authoring rules, the token
  contract on every surface, AA contrast.
- intelligo.dev `/components` and `/blocks`.

#### Changed

- The CLI scaffold writes base-nova, the intelligo tokens and the
  `@intelligo` registry (template 1.11.0).

#### Repository

- The repository is public. Community files: `NOTICE`, `CODE_OF_CONDUCT.md`,
  `SUPPORT.md`, issue and pull request templates, Dependabot.
- Releases publish through npm trusted publishing (OIDC) with provenance,
  only after CI passes on main; the npm token is gone.
  `scripts/npm-maintain.mjs` applies deprecations and the prerelease
  `latest` tag.
- Every package carries a description, keywords, `NOTICE` and its `src`,
  so the published source maps resolve.
- `@intelligo-dev/mastra` bounds its `@mastra/core` peer below 2.

## [1.0.0-beta.6] — 2026-09-13

The release after the layout settled: the chat item binds the transport
package, releases publish themselves, and the last generic piece the
first product still carried — the prompt sanitiser — has its home.

### Breaking

- **The `chat` registry item binds `@intelligo-dev/chat`.** Its Route
  Handler is two lines — `createChatHandler(chatServerConfig)` — and
  `lib/chat-server-config.ts` is the transport's `ChatServerConfig`:
  `executions`, `model`, `agent` (or `resolveAgent`), `prepareMessages`,
  `attachments`, `reasoning`, `deriveTitle`, `onTurn`, and a `messages`
  translator bound to this item's `route.*` keys. `lib/chat-model.ts`
  builds its stub from `@intelligo-dev/chat/testing`; `lib/chat-quota.ts`,
  `credit-status-banner.tsx` and `chat-panel.tsx` read the quota shape
  and error codes from `@intelligo-dev/chat/client`. The panel sends
  `agentId` from `chatConfig.agent` so a multi-agent deployment can
  resolve per conversation, and the banner keys its copy on the
  entitlement port's own refusal code rather than the HTTP one. Three
  `route.*` message keys are new: `attachmentRejected`, `notFound`,
  `billingNotConfigured`. Reinstall the item; keep your
  `lib/chat-config.tsx`, `lib/chat-renderers.tsx` and
  `lib/chat-server-config.ts` bindings.

### Added

- **`@intelligo-dev/core/prompt`** — `sanitizeForSystemPrompt()` and
  `detectPromptInjection()`, the sweep routed to core from the
  first product's runtime package: role markers, override phrases and
  obfuscated separators stripped from user-authored text before it is
  concatenated into a system prompt, with the pattern list exported so a
  product extends it rather than re-implements it. Dependency-free, so
  a tool or the chat transport's `prepareMessages` seam can reach it.

### Changed

- **Releases publish themselves.** A release is one commit — every
  published manifest bumped, `CHANGELOG.md` headed with the version's
  section — and merging it to main builds, runs the suite, publishes,
  pushes the tag and creates the GitHub release from that section.
  Deprecations are not part of it: `scripts/npm-deprecations.json` is
  applied by a maintainer running `node scripts/npm-maintain.mjs`, which
  the release workflow cannot do under OIDC. The hand-pushed
  tag still works as a fallback. A version with no changelog section
  does not release: the notes are the one thing a script cannot write.

## [1.0.0-beta.5] — 2026-09-12

The release that makes the package layout something a developer who did
not write it can predict. Three packages fold into subpaths under one
rule, the Next.js adapter becomes the framework's one door to
`next/*`, the page registry becomes a workspace the toolchain owns, and
the chat transport becomes a package — the UI item binds it
in the next release, once this one is on npm.

### Breaking

- **`@intelligo-dev/money` is `@intelligo-dev/core/money`.** The
  amount-plus-currency value object had its own package so that
  `executions/pricing`, a zero-import leaf, could reach it. A
  dependency-free subpath of core has the same property — `core/registry`
  already works that way — and one fewer package to install, version and
  explain. The npm name is deprecated; the API is unchanged.
- **`@intelligo-dev/http` is `@intelligo-dev/core/request-context` plus
  `@intelligo-dev/next`.** The contract — `getRequestHeaders()`,
  `setRequestContextSource()`, `withRequestHeaders()` — is a
  dependency-free subpath of core. The Next.js binding is its own
  package, the framework's one door to `next/*`, and it also mounts
  Better-Auth's route handlers: `@intelligo-dev/auth/next` is
  `@intelligo-dev/next/auth`. One adapter package per host framework is
  what `@sentry/nextjs`, `@clerk/nextjs` and `@payloadcms/next` do, and
  it leaves `auth` importing nothing that is not authentication.
- **`@intelligo-dev/billing-core` folds into `@intelligo-dev/billing`.**
  It existed so plan types could be imported without Stripe or
  `server-only`, and nothing ever imported it without also importing
  `billing`. Subpaths do the same job: `@intelligo-dev/billing/plans`,
  `/plan-registry`, `/payment` and `/quota-types` import neither, and
  an architecture test walks their imports to keep it so. `/plans` and
  `/payment` already existed as re-exports; the other two are new.

### Added

- **`@intelligo-dev/chat`** — the AI-SDK-native chat transport as a
  package: `createChatHandler(config)` returns `{ POST, DELETE }` over
  Web `Request`/`Response`. The registry's `chat` item shipped this as a
  434-line Route Handler consumers install verbatim and may not edit —
  which is a function, not template source. The seams a real product
  had forked the route to get are now config: `resolveAgent`,
  `prepareMessages`, `attachments`, `reasoning`, an async `deriveTitle`,
  `persist`, `onTurn` telemetry and a localised `messages` translator.
  It also persists the user's turn, which the route never did: without
  `originalMessages`, `createUIMessageStream`'s `onFinish` sees only
  the reply. The name was on the dissolved-packages list; this release
  reuses it for the part of the old package that was never UI.

### Changed

- **The page registry is the private workspace `packages/registry`.**
  It was a top-level directory outside every workspace: not in turbo,
  not linted by `pnpm lint`, never type-checked in place. It is now
  `@intelligo-dev/registry` with `private: true` — where a Turborepo
  keeps tooling workspaces — with `build` (shadcn) and `lint` tasks of
  its own. The architecture rules that assumed everything under
  `packages/` ships to npm now read `private`, as `pnpm publish -r`
  already did. Item source, `registry.json` and `requires.json` are
  unchanged; only the path moved.

## [1.0.0-beta.4] — 2026-09-12

The first release aimed at the second product rather than the first.
Every change here answers a defect an audit of the framework and its one
consumer turned up, and most of them are things that are invisible in
this repository and only break in somebody else's.

### Breaking

- **Shared-identity dependencies are peers.** `drizzle-orm`, `zod`,
  `react`, `react-dom`, `better-auth` and `stripe` move from
  `dependencies` to `peerDependencies` across eight packages. Two copies
  of any of them silently breaks a consumer: `instanceof` fails across
  zod copies so the schemas `auth` exports will not validate their data,
  two drizzle copies mean the `organization` table object a package
  references is not the one their query builder sees, two React copies
  throw "invalid hook call", and `Stripe.Event` in
  `createStripeWebhookHandler`'s options is typed against a Stripe the
  consumer does not have. pnpm's hoisting and this repository's
  `overrides` hid all of it.
- **`next` is no longer a peer of `core`, `billing` or `ui`.** None of
  them imports it. Every consumer — including a queue worker, a cron
  runner, or an API that only wanted `core/db` — was made to install
  Next 16, and a product on another framework was locked out for
  nothing.
- **`@intelligo-dev/auth` no longer imports `next/headers`.** Bind a
  request-context source from the composition root:
  `setRequestContextSource(nextRequestContext)`. Without it, anything
  that resolves a session throws `RequestContextUnavailableError` naming
  the two lines that fix it.
- **The model registry is open.** `MODEL_CONFIGS` and
  `MODEL_OUTPUT_BUDGET` are replaced by `registerModel`/`registerModels`
  and `DEFAULT_MODELS`; `ModelId` is `string`. Call
  `registerModels(DEFAULT_MODELS)` from the composition root. Pricing an
  unregistered id now throws instead of guessing.
- **`@intelligo-dev/agents/documents` is removed** (it was already dead;
  use `@intelligo-dev/core/documents`).

### Added

- **`@intelligo-dev/money`** — an amount with its currency attached, in
  micros. Nothing depends on it yet; it is the type the money layer
  moves onto next. Micros rather than minor units because a chat turn on
  a cheap model costs about $0.0019 of provider time, which whole cents
  round with a 35% error.
- **`@intelligo-dev/http`** — where request-scoped headers come from.
  `@intelligo-dev/http/next` is now the only file in the framework that
  imports `next/*`, and an architecture test keeps it that way.
- **`@intelligo-dev/core/registry`** — registries that survive a
  bundler duplicating the module they live in.
- **The `chat` item tells you about credit before you spend it.** A
  server-rendered quota read, a banner for blocked and running-low, and
  a composer that disables while blocked. The one product on this item
  had patched three shipped files to add exactly this.
- **`intelligo doctor` checks that the composition root registers model
  prices**, since a root that does not leaves admission refusing every
  request with `unknown_model`.

### Fixed

- **Every package ships its licence.** `"license": "Apache-2.0"` is
  metadata; §4(a) requires the terms to travel with the distribution,
  and all eleven published tarballs went out without them. They now
  carry a LICENSE and a README, declare `engines`, and no longer ship a
  tsbuildinfo.
- **Registries survive a duplicated module.** Next's server build can
  instantiate a package twice, so the composition root wrote to one copy
  of a registry and the request path read another — silently. The one
  product to hit it saw "No billing product configured" from a page that
  rendered fine, and worked around it with an import side effect
  the framework forbids.
- **Admission refuses an unpriceable model instead of 500ing.** A new
  `unknown_model` refusal code, so a deployment that forgot to register
  a model gets a 402 that says why.
- **`@intelligo-dev/billing-core` is under test at all.** It had no
  vitest project, so it was invisible to `pnpm test` — the package
  holding the plan, feature, trial, seat, rate-limit and payment
  registries.
- **The CLI works on Windows.** `new URL(...).pathname` yields
  `/C:/Users/...`, so `create` and `doctor` could not find their own
  templates.
- **The scaffold writes `proxy.ts`.** Next 16 deprecated the
  `middleware` file convention and says so on every build.
- **Registry: no page redirects from inside a streamed segment.** The
  `auth-login` item shipped a `loading.tsx` for the whole `(auth)` group
  beside a login page that redirects a signed-in user; `onboarding` and
  `checkout` shipped one beside their own redirecting pages. A server
  `redirect()` thrown behind a Suspense boundary arrives mid-stream and
  trips React #310 in `next/link`'s `useOptimistic`, so the page fell
  into its error boundary instead of moving (vercel/next.js#78396). The
  three loading files are gone from the items and the reference app, and
  `tests/architecture/streamed-redirects.test.ts` fails on any page that
  calls `redirect()` under a `loading.tsx`.

## [1.0.0-beta.3] — 2026-08-31

### Fixed

- **Published `dist` imports carry explicit extensions.** tsc emitted
  the sources' extensionless relative specifiers (`./components/button`)
  verbatim, which Next resolves but Node's ESM loader and vitest's
  resolver do not: a consumer's `tsx` script or test importing
  `@intelligo-dev/ui` failed with "Cannot find module …/dist/components/button".
  Every package build now runs `scripts/fix-esm-extensions.mjs` over
  `dist`, and CI fails on an extensionless relative import in any
  built package.

## [1.0.0-beta.2] — 2026-08-31

### Fixed

- **`@intelligo-dev/core`: `sessions.active_organization_id` has a
  migration.** The schema has carried the column since workspace
  switching landed, but no migration created it — every environment
  was provisioned by `db:push`, so a database built from the chain
  refused the first sign-in. Migration 0042 adds it (`IF NOT EXISTS`),
  and a new architecture test (`tests/architecture/migration-drift`)
  fails when a schema column has no migration.

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

### Changed

- **The registry is hosted by `apps/site`** at `https://intelligo.dev/r/<item>.json`;
  the GitHub Pages workflow is gone. CI now fails when the site's
  committed copy of the registry drifts from `registry/`.
- **One auth secret name.** `env.ts` required `AUTH_SECRET`, `doctor`
  and the scaffold required `BETTER_AUTH_SECRET`, and `betterAuth()`
  named neither. `BETTER_AUTH_SECRET` is canonical everywhere;
  `AUTH_SECRET` is accepted as a legacy alias with a warning; the auth
  instance passes `secret` explicitly. The scaffold's composition root
  now calls `assertEnv()` once, so a missing `DATABASE_URL` or secret
  fails on the first request rather than inside a handler. A missing
  `CRON_SECRET` is a warning, not a production error — the framework
  ships no cron route; the maintenance route checks it itself.
- **`@intelligo-dev/billing`: `checkQuota` splits into `estimateQuota`
  and `reserveQuota`, and refusals carry a code.** One name meant two
  things depending on an optional argument — a read-only estimate that
  must never gate a run, and an atomic reservation. They are now two
  functions with two result types (`QuotaEstimate` never carries a
  reservation; `QuotaAdmission` always does when allowed). `checkQuota`
  remains as a deprecated wrapper for one release. Every refusal now
  carries `code: "insufficient_credits" | "allowance_depleted" |
"billing_not_configured"` beside the human-readable `reason`; the
  code travels through `EntitlementDecision`, `ExecutionRun` and
  `ExecutionRefusedError.reasonCode`, and both reference routes map it
  the same way (402, or 503 for an unconfigured deployment — the
  assistant route answered 429 before). An unconfigured deployment is
  refused rather than thrown at (`BillingNotConfiguredError`).
- **`@intelligo-dev/auth`: `requireRole` accepts multi-role members** —
  Better-Auth stores roles as a comma-separated string; a member holding
  `owner,admin` was refused by every role gate. `getWorkspaceContext`
  treats a Better-Auth `FORBIDDEN` on the session's active organization
  (a removed member) as "no active workspace" and falls back, instead
  of letting the provider error escape.
- Documentation and comments brought back in line with the code: the
  execution schema/queries now describe `settling` (and its two
  readings); the `settleUsage` port no longer promises retries; stale
  notes claiming `sessions.activeOrganizationId` and the organization
  tables are absent are gone; `validate.ts`/`check-db` recommend
  `intelligo migrate` rather than `db:push`; the README counts
  twenty-five page families and names `intelligo.dev/r` as the hosted
  registry.

### Added

- **`registry/requires.json`** — the machine-readable form of what item
  descriptions said in prose: for every item, the sibling items it
  imports from (install them first), the scaffold files it imports, the
  names the composition root must export, and the feature keys it
  gates on. The architecture suite asserts it matches the code exactly,
  CI derives the install order from it (replacing a hand-ordered
  string), and `intelligo doctor` checks every installed item against a
  bundled, byte-verified copy — including the `chat` item's feature key,
  which used to be a 403 discovered after install.
- **`createStripeWebhookHandler()` in `@intelligo-dev/billing`**, and a
  `POST /api/webhooks/stripe` route in the scaffold and the reference
  app. The framework shipped webhook _handlers_ but no receiver; the
  only implementation lived in a private product, acknowledged a
  throwing handler with 202 (Stripe never retried — the event was
  lost) and wrote its `finance_events` row after the handlers. The
  receiver records the receipt first, claims it with an
  `UPDATE … WHERE processed_at IS NULL` so concurrent duplicates run
  the handlers once, answers 500 on a handler error (Stripe retries)
  and releases the claim, and 400 on a bad signature.
- **`intelligo add maintenance`** — the cron the code's comments
  assumed. A `CRON_SECRET`-gated `GET /api/cron/maintenance` that
  reconciles stale executions through `executions.reconcile`, drops
  expired reservations and rate-limit buckets, expires trials and sends
  their reminders, and prunes week-old jobs; `doctor` errors when the
  route exists without a 32-character `CRON_SECRET`. The reference app
  mounts it. (`app-scaffold` 1.7.0 also adds `@intelligo-dev/jobs`, the
  webhook route, and the secrets to `.env.example`.)
- **`executions.reconcile(executionId, { abandonRunningAfterMs? })`** — a
  way out of `settling`. The lifecycle claimed a row and, if the charge
  threw or the process died before the final status flip, left it
  `settling` forever; `fail()` only moves `running` rows, so nothing
  could finish it. `reconcile` asks the new `findSettlement` port
  whether the ledger already holds the charge (confirming the row if
  so), otherwise re-runs `settleUsage` from the usage the claim now
  records on the row, and — when given a cutoff — fails a `running` row
  the stream abandoned and releases its hold. Every step is the same
  compare-and-swap the lifecycle uses. `@intelligo-dev/billing` exports
  `findSettlementByRequestId`; the reference composition root binds it.
- **`audit_events` is append-only at the database** (migration 0041):
  the same `P0001` trigger `user_memory_audit` has had since 0018, and
  `workspace_id` is `SET NULL` on workspace delete instead of cascading
  — the trail outlives the tenant. Covered by the real-database
  trigger suite.
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
  installed unmodified.
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

## Pre-release history

### [0.15.0] — 2026-08-29 · V2: an application framework and operational platform

Two hundred commits, almost all in the last five days of August,
re-positioned the project from a product monorepo into a framework.
Everything a consumer touches today dates from here.

#### Decisions

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
  memory-audit contract, and `registerAuditSink` as the audit
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

- `agents`, `ai`, `chat` are deprecated and dissolving: never
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
- Public extraction tooling: one allowlist, an extraction script
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
  adapters — later superseded by the explicit composition root, but
  the origin of "registries are populated, never
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

[1.0.0-beta.6]: https://github.com/intelligo-mn/framework/releases/tag/v1.0.0-beta.6
[1.0.0-beta.5]: https://github.com/intelligo-mn/framework/releases/tag/v1.0.0-beta.5
[1.0.0-beta.4]: https://github.com/intelligo-mn/framework/releases/tag/v1.0.0-beta.4
[1.0.0-beta.3]: https://github.com/intelligo-mn/framework/releases/tag/v1.0.0-beta.3
[1.0.0-beta.2]: https://github.com/intelligo-mn/framework/releases/tag/v1.0.0-beta.2
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
