/** The half that is yours. */
export const YOUR_HALF = [
  { title: "Prompts", note: "the voice, the guardrails, the domain" },
  { title: "Tools", note: "what the agent can actually do" },
  { title: "Domain data", note: "the knowledge nobody else has" },
  { title: "Evals", note: "how you know it's getting better" },
];

/**
 * The half that is the same in every AI SaaS. Every line is a service
 * or surface that exists in the packages today — not a wish list. A line
 * that needs something from you before it runs says what: keys, a
 * registration, a route, a command.
 */
export const OTHER_HALF = [
  {
    text: "sign-in with email; Google and GitHub once you add keys",
    pkg: "auth",
  },
  { text: "email verification", pkg: "auth" },
  { text: "password reset", pkg: "auth" },
  { text: "workspaces with an active one that persists", pkg: "auth" },
  { text: "owner / admin / member roles", pkg: "auth" },
  { text: "invitations — expiry, cancel, accept", pkg: "auth" },
  { text: "sole-owner protection, ownership transfer", pkg: "auth" },
  { text: "plans as data, feature gates", pkg: "billing" },
  {
    text: "a monthly allowance per plan, reset on the invoice",
    pkg: "billing",
  },
  { text: "credit balances", pkg: "billing" },
  { text: "worst-case reservations, released on failure", pkg: "billing" },
  {
    text: "trials with abuse checks and conversion, once you register one",
    pkg: "billing",
  },
  { text: "Stripe subscriptions, credit packs, portal", pkg: "billing" },
  { text: "idempotent webhooks through a finance ledger", pkg: "billing" },
  { text: "usage and cost per request, monthly rollups", pkg: "billing" },
  { text: "a provider contract for QR and invoice payments", pkg: "billing" },
  { text: "execution records: actor, capability, model", pkg: "executions" },
  { text: "model registry with per-token pricing", pkg: "executions" },
  { text: "conversations with cursor pagination", pkg: "core" },
  { text: "documents with versions and ownership checks", pkg: "core" },
  { text: "notifications with read state", pkg: "core" },
  { text: "data export, memory audit, per-fact deletion", pkg: "core" },
  { text: "append-only audit events", pkg: "audit" },
  {
    text: "a Postgres job queue, no Redis — the worker route is yours",
    pkg: "jobs",
  },
  {
    text: "an admin console with audited impersonation, one add away",
    pkg: "admin",
  },
];

/**
 * The same half at a glance, one line per package, for the homepage;
 * /why walks `OTHER_HALF` line by line.
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
