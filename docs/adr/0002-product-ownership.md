# ADR-0002: Consumer application is owned source; admin console is Intelligo-owned

**Status:** Accepted
**Date:** 2026-08-25
**Source:** [Architecture & Improvement Plan V2](../intelligo-architecture-improvement-plan-v2.md) §1, §2.4, §2.5

## Context

Today `apps/app` mixes product UX (support chat, onboarding, dashboard) with framework orchestration (chat handler registry, bootstraps, persistence wiring). A framework that owns the consumer's routes and pages cannot evolve without breaking every product built on it.

## Decision

**Intelligo does not own the consumer application.** The developer owns: Next.js routes/pages/layouts/navigation, customer-facing dashboard, onboarding, billing UX, settings UX, the AI framework and its native implementation (prompts, tools, workflows, memory, RAG, datasets, evals), product database entities, branding, analytics, and conversion flows.

Intelligo supplies: headless services, stable contracts, optional UI primitives, optional default screens as **source templates generated into the consumer repo** (never overwritten during ordinary upgrades), CLI generators, and safe codemods. Each capability targets three usage levels where practical: headless → primitives → generated screen.

**Exception:** the infrastructure administration console is Intelligo-owned under the reserved `/admin/*` namespace, because it manages Intelligo concepts (workspaces, entitlements, credits, executions, audit, jobs, integrations), not the product's customer experience. It exposes configuration, permissions, branding, view registration, and small slots — but never hosts the product dashboard.

### Terminology (use consistently)

- **module** — build-time capability composed via `defineIntelligo({ modules: [...] })`
- **integration** — external/provider adapter (Stripe, QPay, Mastra, Resend, …)
- **extension** — UI or behavioral extension point
- **plugin** — reserved for a future runtime-installable capability; **no runtime plugin marketplace in v1**

## Consequences

- Generated consumer files are tracked by a source manifest (template origin + version) without Intelligo taking ownership; customized files are never replaced wholesale.
- The existing `apps/app` will become the private Acme product application; framework orchestration currently inside it moves behind package APIs (Phases 2–3).
- Admin authorization must be distinct from product workspace roles (see the platform-admin work in Phase 1; enforced fully in Phase 5).
