---
title: Packages
description: Eleven packages on npm under @intelligo-dev — services behind ports, one database, and a strict rule about which package may import which.
order: 0
---

Every package is ESM, TypeScript strict and Apache-2.0, published together at one version. Install the beta with `@beta`:

```bash
pnpm add @intelligo-dev/core@beta @intelligo-dev/auth@beta
```

`intelligo create` adds the set an application needs, so you rarely install them by hand.

## The set

| Package | Responsibility |
| --- | --- |
| [core](/docs/packages/core) | Schema and migrations, email, logging, notifications; conversations, documents, identity |
| [auth](/docs/packages/auth) | Sessions, workspaces, roles, invitations; team, workspace, profile and onboarding services |
| [billing](/docs/packages/billing) | Plans, gates, quotas, credits, trials, Stripe, rate limits; checkout and billing overview |
| [executions](/docs/packages/executions) | The execution lifecycle and the model pricing registry |
| [chat](/docs/packages/chat) | The chat transport: `createChatHandler(config)` → `{ POST, DELETE }` |
| [next](/docs/packages/next) | The Next.js adapter — request context and auth route handlers |
| [audit](/docs/packages/audit) | Append-only audit events |
| [jobs](/docs/packages/jobs) | A Postgres-backed job queue |
| [admin](/docs/packages/admin) | The operational console |
| [mastra](/docs/packages/mastra) | Optional bridge from a Mastra agent to the execution boundary |
| [cli](/docs/packages/cli) | `create`, `add`, `doctor`, `migrate`, `upgrade --check` |

## How they are cut

**One package per runtime target, peer dependency or adapter; shared pure-TypeScript modules are subpaths** ([ADR-0011](https://github.com/intelligo-mn/framework/blob/main/docs/adr/0011-package-topology.md)). That is why money, prompt sanitisation and request context are `@intelligo-dev/core/money`, `/prompt` and `/request-context` rather than packages, and why billing's `/plans`, `/plan-registry`, `/payment` and `/quota-types` can reach a client bundle without pulling in Stripe.

**Dependencies point one way.** `core` imports no other package; `auth` never imports `billing`; `executions` imports nothing — they meet through ports bound in your [composition root](/docs/concepts/composition-root). Only `next` imports `next/*`. The dependency-direction test fails the build otherwise; [/architecture](/architecture) draws the real graph.

**No product vocabulary.** A publishability test audits every package for licence metadata, credentials and product-specific language.
