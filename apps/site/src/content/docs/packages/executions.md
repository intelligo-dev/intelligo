---
title: "@intelligo-dev/executions"
description: "The execution lifecycle — admit, settle, fail — and the model pricing registry."
order: 4
label: executions
---

## Install

```bash
pnpm add @intelligo-dev/executions
```

## Capabilities

Every AI run is bracketed, never wrapped — your route stays written in your framework's own idiom:

```ts
const run = await executions.begin({ workspaceId, userId, capability, model });
if (!run.allowed) return refuse(run.reason);
// ... your framework, your code ...
await run.complete({ usage }); // or run.fail({ error })
```

- **Admit**: entitlement checked through a port, worst-case cost reserved, execution row written
- **Settle**: actual tokens and cost recorded, credits charged — idempotent via compare-and-swap, so a duplicate `complete` cannot double-bill
- **Fail**: reservation released, error recorded; refusals leave audit events
- Model ids are registry keys with per-token pricing and output budgets; an unregistered id is an architecture-test failure, not a silent mis-bill
- Cost converts through a live FX rate and configurable margin; per-request records and monthly rollups feed the dashboards through a query API

## The boundary

Intelligo records what an AI execution cost and whether it was allowed. It does
not wrap the AI framework: prompts, tools and orchestration stay native
([ADR-0003](https://github.com/intelligo-mn/framework/tree/main/docs/adr)).

`createExecutions(ports)` takes four optional ports — `checkEntitlement`,
`settleUsage`, `findSettlement`, `releaseHold` — so this package never imports
billing. The lifecycle claims each transition with a compare-and-swap before
money is spent, and `reconcile` uses `findSettlement` to tell an abandoned run
from a settled one.

## Model pricing

`@intelligo-dev/executions/pricing` is a deliberate zero-import leaf that
client bundles can reach. Model ids are registry keys: an unregistered id has
no price, and guessing one is how a model runs on the cheapest provider and
bills at the most expensive rate.

[npm](https://www.npmjs.com/package/@intelligo-dev/executions) · [source](https://github.com/intelligo-mn/framework/tree/main/packages/executions)
