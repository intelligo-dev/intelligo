/**
 * The package map. `edges` are real workspace imports — the
 * dependency-direction architecture test enforces exactly this set,
 * so if the map is wrong the build is red.
 */
import { PROOF } from "@/lib/proof";

export type PackageInfo = {
  id: string;
  label: string;
  layer: "app" | "intelligo" | "db";
  summary: string;
  bullets: string[];
};

export const PACKAGES: PackageInfo[] = [
  {
    id: "pages",
    label: "installed pages",
    layer: "app",
    summary: "Your source. Rendered by your own shadcn primitives.",
    bullets: [
      `${PROOF.registryItems} registry items, used as-is`,
      "variance through config files",
      "copy from per-item message files",
    ],
  },
  {
    id: "actions",
    label: "thin actions",
    layer: "app",
    summary: "Parse → service → map error → revalidate.",
    bullets: [
      "no business rules in the page",
      "typed errors from services",
      "route handlers only for streaming and webhooks",
    ],
  },
  {
    id: "agent",
    label: "your AI framework",
    layer: "app",
    summary: "Mastra, Vercel AI SDK, anything. Native and unmodified.",
    bullets: [
      "prompts · tools · RAG · memory",
      "no IntelligoAgent to adopt",
      "bracketed by the execution boundary",
    ],
  },
  {
    id: "auth",
    label: "auth",
    layer: "intelligo",
    summary: "Workspaces, roles, invitations — the whole lifecycle.",
    bullets: [
      "email/password and OAuth, verification, reset",
      "multi-tenant workspaces on Better-Auth's organization model",
      "invitation lifecycle: expiry, cancel, accept, pre- and post-verification",
      "sole-owner protection, ownership transfer",
      "ports-based services with unit and real-database suites",
      "platform admin is a row, not an env var",
    ],
  },
  {
    id: "billing",
    label: "billing",
    layer: "intelligo",
    summary: "Plans, quotas, credits with reservations, Stripe, trials.",
    bullets: [
      "plan registry your product registers into",
      "feature gates, per-feature quotas, rate limiting",
      "credit reservations held for the run, released on failure",
      "trials with abuse checks and conversion",
      "Stripe subscriptions, credit packs, portal, idempotent webhooks",
      "provider seam for QR/invoice payments",
    ],
  },
  {
    id: "chat",
    label: "chat",
    layer: "intelligo",
    summary: "The chat transport as a function. The UI is yours.",
    bullets: [
      "createChatHandler(config) → { POST, DELETE }",
      "auth → rate limit → feature gate → persistence → execution boundary",
      "resolveAgent, prepareMessages, attachments, reasoning, telemetry seams",
      "Web Request/Response; imports no web framework",
      "stub model streams with no API key",
    ],
  },
  {
    id: "next",
    label: "next",
    layer: "intelligo",
    summary: "The one package that imports next/*.",
    bullets: [
      "binds the request context from the composition root",
      "mounts Better-Auth's route handlers at /api/auth",
      "everything else runs from a worker, a Hono API or a test",
    ],
  },
  {
    id: "executions",
    label: "executions",
    layer: "intelligo",
    summary: "admit · settle · fail. Model registry and cost math.",
    bullets: [
      "begin() → complete() / fail(), idempotent via compare-and-swap",
      "entitlement and settlement arrive through ports",
      "unregistered model id = architecture-test failure",
      "cost through live FX and configurable margin",
      "depends on nothing else in the framework",
    ],
  },
  {
    id: "core",
    label: "core",
    layer: "intelligo",
    summary: "Conversations, documents, identity, notifications, email.",
    bullets: [
      "cursor-paginated history, votes, regeneration trimming",
      "documents with versions and ownership checks",
      "notifications with read state and product triggers",
      "data export, memory-audit trail, per-fact deletion",
      "every operation takes a resolved actor and scopes inside",
    ],
  },
  {
    id: "audit",
    label: "audit",
    layer: "intelligo",
    summary: "Append-only events and the memory-audit contract.",
    bullets: ["refusals leave events, not gaps", "impersonation is recorded"],
  },
  {
    id: "jobs",
    label: "jobs",
    layer: "intelligo",
    summary: "Postgres-backed queue. No Redis.",
    bullets: ["FOR UPDATE SKIP LOCKED", "retries with backoff"],
  },
  {
    id: "admin",
    label: "admin",
    layer: "intelligo",
    summary: "The operational console.",
    bullets: [
      "platform overview, operations, integration health",
      "audited impersonation",
    ],
  },
  {
    id: "cli",
    label: "cli",
    layer: "intelligo",
    summary: "create · add · doctor · migrate --check · upgrade --check.",
    bullets: [
      "scaffold is registry-ready",
      "knows which generated files you changed, by content hash",
    ],
  },
  {
    id: "mastra",
    label: "mastra",
    layer: "intelligo",
    summary: "Optional bridge. Installs without Mastra.",
    bullets: [
      "depends only on executions",
      "@mastra/core is an optional peer it never imports",
    ],
  },
  {
    id: "db",
    label: "PostgreSQL",
    layer: "db",
    summary:
      "One database, explicit per-table ownership. pgvector rides along.",
    bullets: [
      "no Redis, no separate vector store",
      "migrations shipped with releases",
    ],
  },
];

/** Real import edges (from → to). The absence of auth→billing and executions→anything is the point. */
export const EDGES: { from: string; to: string }[] = [
  { from: "pages", to: "actions" },
  { from: "actions", to: "auth" },
  { from: "actions", to: "billing" },
  { from: "actions", to: "core" },
  { from: "agent", to: "executions" },
  { from: "billing", to: "core" },
  { from: "billing", to: "executions" },
  { from: "auth", to: "core" },
  { from: "next", to: "auth" },
  { from: "next", to: "core" },
  { from: "chat", to: "auth" },
  { from: "chat", to: "billing" },
  { from: "chat", to: "core" },
  { from: "chat", to: "executions" },
  { from: "admin", to: "auth" },
  { from: "admin", to: "audit" },
  { from: "admin", to: "core" },
  { from: "mastra", to: "executions" },
  { from: "auth", to: "db" },
  { from: "billing", to: "db" },
  { from: "executions", to: "db" },
  { from: "core", to: "db" },
  { from: "audit", to: "db" },
  { from: "jobs", to: "db" },
];
