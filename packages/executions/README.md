# @intelligo-dev/executions

The execution lifecycle (admission, running, settlement) and the model cost registry.

Part of [Intelligo](https://intelligo.dev), an application framework and
operational platform for vertical AI SaaS products. Every `@intelligo-dev/*`
package is released at one version and shares one database schema;
`pnpm dlx @intelligo-dev/cli@beta create my-app` installs the set an
application needs. Documentation:
[intelligo.dev/docs/packages/executions](https://intelligo.dev/docs/packages/executions).

## Install

```bash
pnpm add @intelligo-dev/executions@beta drizzle-orm
```

`drizzle-orm` is a peer. The `executions` table is part of the framework's
schema, which `intelligo migrate` from
[`@intelligo-dev/cli`](https://www.npmjs.com/package/@intelligo-dev/cli)
applies.

## The boundary

Intelligo records what an AI execution cost and whether it was allowed. It does
not wrap the AI framework: prompts, tools and orchestration stay native.

## Use

The composition root builds one instance, with the ports bound:

```ts
// lib/intelligo.ts
import {
  DEFAULT_MODELS,
  createExecutions,
  registerModels,
} from "@intelligo-dev/executions";

registerModels(DEFAULT_MODELS);

export const executions = createExecutions({
  checkEntitlement, // may this workspace run this model? takes the hold
  settleUsage, // charge what the run used
  findSettlement, // did that charge already commit?
  releaseHold, // the run failed: give the hold back
});
```

A run is one `begin`, then exactly one `complete` or `fail`:

```ts
const run = await executions.begin({
  workspaceId,
  userId,
  capability: "support.reply",
  model: "google/gemini-2.5-flash",
});
if (!run.allowed) return refuse(run.code, run.reason);

try {
  const result = await agent.generate(messages); // your framework, natively
  await run.complete({ usage: result.usage, model: "google/gemini-2.5-flash" });
} catch (error) {
  await run.fail({ error });
  throw error;
}
```

All four ports are optional, so this package never imports billing; the
reference composition root binds them to `@intelligo-dev/billing`. The
lifecycle claims each transition with a compare-and-swap before money is
spent, so a late `complete` racing a `fail` cannot charge twice or release
twice.

`executions.reconcile(executionId, { abandonRunningAfterMs? })` repairs a run
whose process died: it asks `findSettlement` whether the charge committed,
confirms it onto the row or re-runs settlement from the recorded usage, and
fails a `running` row that outlived the threshold. `findStaleExecutions` finds
the candidates; `listExecutions`, `summarizeExecutions` and
`summarizeExecutionsByDay` read the record for a usage page.

## Model pricing

`@intelligo-dev/executions/pricing` is a deliberate zero-import leaf that
client bundles can reach. Model ids are registry keys: an unregistered id has
no price, and guessing one is how a model runs on the cheapest provider and
bills at the most expensive rate. Pricing throws `UnknownModelError` instead.

Nothing self-registers. `DEFAULT_MODELS` is the catalogue the framework ships,
as data; a deployment registers it, its own contracted rates, or a model the
framework has never heard of:

```ts
import { registerModel } from "@intelligo-dev/executions/pricing";

registerModel({
  id: "acme/large-1",
  provider: "acme",
  model: "large-1-2026-08",
  displayName: "Acme Large",
  costPerMInputTokens: 1.25, // USD per million, as the provider quotes it
  costPerMOutputTokens: 5,
  maxOutputTokens: 8_192, // sizes the worst-case hold at admission
  capabilities: {
    thinking: false,
    toolCall: true,
    vision: false,
    webSearch: false,
    codeExec: false,
  },
});
```

`providerCost` is what a run cost the deployment; `chargeFor` applies the
deployment's currency, rate and margin (`BillingRate`) and returns both
figures as money in micros.

## Licence

Apache-2.0
