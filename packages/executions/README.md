# @intelligo-dev/executions

The execution lifecycle — admission, running, settlement — and the model cost registry.

Part of [Intelligo](https://github.com/intelligo-mn/framework), an application
framework and operational platform for vertical AI SaaS products. This package
is published from that repository and is not meant to be used on its own.

## Install

```bash
pnpm add @intelligo-dev/executions
```

## The boundary

Intelligo records what an AI execution cost and whether it was allowed. It does
not wrap the AI framework: prompts, tools and orchestration stay native
(ADR-0003).

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

## Licence

Apache-2.0
