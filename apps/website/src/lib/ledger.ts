/** The half that is yours. */
export const YOUR_HALF = [
  { title: "Prompts", note: "the voice, the guardrails, the domain" },
  { title: "Tools", note: "what the agent can actually do" },
  { title: "Domain data", note: "the knowledge nobody else has" },
  { title: "Evals", note: "how you know it's getting better" },
];

/**
 * The jobs the other half does, in the words of whoever has to get them
 * done. /product walks every line under its job; the homepage's tour takes
 * four of them.
 */
export const JOBS = [
  {
    id: "accounts",
    title: "Sign them up",
    lede: "Who is signed in, which workspace they are in, and what they may do there.",
  },
  {
    id: "billing",
    title: "Charge for it",
    lede: "What a plan allows, what a customer has left, and how they pay for more.",
  },
  {
    id: "runs",
    title: "Account for every run",
    lede: "What each call to a model cost, who it was for, and that it was charged exactly once.",
  },
  {
    id: "data",
    title: "Keep what they make",
    lede: "The conversations, documents and notices a product accumulates — and the customer's right to take them or delete them.",
  },
  {
    id: "operations",
    title: "Run it",
    lede: "What you reach for on the day something goes wrong, and the checks that make that day rarer.",
  },
] as const;

export type JobId = (typeof JOBS)[number]["id"];

export type LedgerLine = { text: string; pkg: string; job: JobId };

/**
 * The half that is the same in every AI SaaS. Every line is a service
 * or surface that exists in the packages today — not a wish list. A line
 * that needs something from you before it runs says what: keys, a
 * registration, a route, a command.
 */
export const OTHER_HALF: LedgerLine[] = [
  {
    text: "sign-in with email; Google and GitHub once you add keys",
    pkg: "auth",
    job: "accounts",
  },
  {
    text: "email verification",
    pkg: "auth",
    job: "accounts",
  },
  {
    text: "password reset",
    pkg: "auth",
    job: "accounts",
  },
  {
    text: "workspaces with an active one that persists",
    pkg: "auth",
    job: "accounts",
  },
  {
    text: "owner / admin / member roles",
    pkg: "auth",
    job: "accounts",
  },
  {
    text: "invitations — expiry, cancel, accept",
    pkg: "auth",
    job: "accounts",
  },
  {
    text: "sole-owner protection, ownership transfer",
    pkg: "auth",
    job: "accounts",
  },
  {
    text: "plans as data, feature gates",
    pkg: "billing",
    job: "billing",
  },
  {
    text: "a monthly allowance per plan, reset on the invoice",
    pkg: "billing",
    job: "billing",
  },
  {
    text: "credit balances",
    pkg: "billing",
    job: "billing",
  },
  {
    text: "worst-case reservations, released on failure",
    pkg: "billing",
    job: "runs",
  },
  {
    text: "trials with abuse checks and conversion, once you register one",
    pkg: "billing",
    job: "billing",
  },
  {
    text: "Stripe subscriptions, credit packs, portal",
    pkg: "billing",
    job: "billing",
  },
  {
    text: "idempotent webhooks through a finance ledger",
    pkg: "billing",
    job: "billing",
  },
  {
    text: "usage and cost per request, monthly rollups",
    pkg: "billing",
    job: "runs",
  },
  {
    text: "a provider contract for QR and invoice payments",
    pkg: "billing",
    job: "billing",
  },
  {
    text: "execution records: actor, capability, model",
    pkg: "executions",
    job: "runs",
  },
  {
    text: "model registry with per-token pricing",
    pkg: "executions",
    job: "runs",
  },
  {
    text: "conversations with cursor pagination",
    pkg: "core",
    job: "data",
  },
  {
    text: "documents with versions and ownership checks",
    pkg: "core",
    job: "data",
  },
  {
    text: "notifications with read state",
    pkg: "core",
    job: "data",
  },
  {
    text: "data export, memory audit, per-fact deletion",
    pkg: "core",
    job: "data",
  },
  {
    text: "append-only audit events",
    pkg: "audit",
    job: "operations",
  },
  {
    text: "a Postgres job queue, no Redis — the worker route is yours",
    pkg: "jobs",
    job: "operations",
  },
  {
    text: "an admin console with audited impersonation, one add away",
    pkg: "admin",
    job: "operations",
  },
  {
    text: "doctor: env, migrations, billing registration, model ids and secrets, checked before an incident",
    pkg: "cli",
    job: "operations",
  },
  {
    text: "migrate by content hash, in one transaction; --check --json as a deploy gate",
    pkg: "cli",
    job: "operations",
  },
  {
    text: "upgrade --check, which knows the generated files you edited",
    pkg: "cli",
    job: "operations",
  },
  {
    text: "a maintenance route: stale runs reconciled, expired holds and trials dropped, old jobs pruned",
    pkg: "cli",
    job: "operations",
  },
];

/**
 * The same half at a glance, one line per package, for the homepage;
 * /product walks `OTHER_HALF` line by line, under its jobs.
 */
export const OTHER_HALF_SUMMARY = [
  {
    pkg: "auth",
    text: "sign-in, verification and reset; workspaces, roles, invitations, ownership transfer",
  },
  {
    pkg: "billing",
    text: "plans as data, gates and quotas; credits with reservations; trials; Stripe behind an idempotent ledger",
  },
  {
    pkg: "executions",
    text: "every run admitted, settled and recorded, against a model registry with per-token pricing",
  },
  {
    pkg: "core",
    text: "conversations, versioned documents, notifications; data export and per-fact deletion",
  },
  { pkg: "audit", text: "append-only audit events" },
  { pkg: "jobs", text: "a Postgres job queue, no Redis" },
  { pkg: "admin", text: "an operator's console with audited impersonation" },
];
