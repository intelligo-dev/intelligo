# ADR-0005: One service layer behind two transports; one composition root

**Status:** Accepted
**Date:** 2026-08-25

## Context

Business logic currently lives inside Server Actions (`apps/app/actions/*`) and Route Handlers (`apps/app/app/api/*`) directly. The chat route alone runs two parallel auth paths (`validateAIRequest` for POST, `withAuth` for DELETE). Registration/bootstrap happens through **four competing paths**: `apps/app/lib/plugins.ts` (`initPlugins()` from a layout), `apps/app/lib/bootstrap.ts` (client renderer registry), `apps/app/lib/server-bootstrap.ts` (side-effect import), and `config/billing-bootstrap.ts` in the product's domain package (import-order-dependent side effect inside a package).

## Decision

**Transports:**

- **Server Actions** are used for internal Next.js UI mutations only.
- **Route Handlers/API routes** are used for AI streaming, auth handlers, webhooks, public/mobile clients, provider callbacks, uploads, cron/jobs, and external integrations.
- **Both transports are thin callers into one application service layer.** Business logic (quota, credits, billing, tenancy, execution accounting) lives in package services, never in actions or route handlers.

**Composition:**

- There is **one explicit composition root** per application: build-time `defineIntelligo({ modules: [auth(), workspaces(), billing(), audit()] })`-style configuration.
- **Import-side-effect registration is banned.** Registries (billing plans, renderers, document patterns, product handlers) are populated explicitly from the composition root, never by importing a package.

## Consequences

- Phase 2 extracts services out of the chat route/actions (admission = entitlement + reservation; settlement = usage/cost recording); actions and routes shrink to validation + service call + response shaping.
- Phase 3 consolidates the four bootstrap paths into the composition root and deletes `billing-bootstrap.ts`-style side effects.
- The two auth paths in the chat route unify onto shared middleware from the service layer.
- The `next` package (Phase 4) hosts the request-context/transport helpers so `packages/auth` helpers stop hard-depending on Next.js implicit request context.
