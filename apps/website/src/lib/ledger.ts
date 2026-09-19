/** The half that is yours. */
export const YOUR_HALF = [
  { title: "Prompts", note: "the voice, the guardrails, the domain" },
  { title: "Tools", note: "what the agent can actually do" },
  { title: "Domain data", note: "the knowledge nobody else has" },
  { title: "Evals", note: "how you know it's getting better" },
];

/**
 * The half that is the same in every AI SaaS. Every line is a service
 * or surface that exists in the packages today — not a wish list.
 */
export const OTHER_HALF = [
  { text: "sign-in with email and OAuth", pkg: "auth" },
  { text: "email verification", pkg: "auth" },
  { text: "password reset", pkg: "auth" },
  { text: "workspaces with an active one that persists", pkg: "auth" },
  { text: "owner / admin / member roles", pkg: "auth" },
  { text: "invitations — expiry, cancel, accept, idempotent", pkg: "auth" },
  { text: "sole-owner protection, ownership transfer", pkg: "auth" },
  { text: "plans as data, feature gates", pkg: "billing" },
  { text: "per-feature quotas with grace overage", pkg: "billing" },
  { text: "credit balances", pkg: "billing" },
  { text: "worst-case reservations, released on failure", pkg: "billing" },
  { text: "trials with abuse checks and conversion", pkg: "billing" },
  { text: "Stripe subscriptions, credit packs, portal", pkg: "billing" },
  { text: "idempotent webhooks through a finance ledger", pkg: "billing" },
  { text: "regional payment providers (QR, invoice, poll)", pkg: "billing" },
  { text: "execution records: actor, capability, model", pkg: "executions" },
  { text: "usage and cost per request, monthly rollups", pkg: "executions" },
  { text: "model registry with per-token pricing", pkg: "executions" },
  { text: "conversations with cursor pagination", pkg: "core" },
  { text: "documents with versions and ownership checks", pkg: "core" },
  { text: "notifications with read state", pkg: "core" },
  { text: "data export, memory audit, per-fact deletion", pkg: "core" },
  { text: "append-only audit events", pkg: "audit" },
  { text: "a job queue without Redis", pkg: "jobs" },
  { text: "an admin console with audited impersonation", pkg: "admin" },
];
