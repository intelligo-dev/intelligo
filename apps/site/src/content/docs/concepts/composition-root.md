---
title: Composition root and ports
description: One explicit file wires the application together. Packages take ports instead of importing each other, and nothing registers itself on import.
order: 2
label: Composition root
---

## One composition root

`lib/intelligo.ts` is the single place an application wires itself together. `create` generates it once; after that it is yours.

<!-- snippet: packages/cli/templates/app-scaffold/intelligo.ts.tpl#composeIntelligo -->

```ts title="lib/intelligo.ts"
export function composeIntelligo(): void {
  if (composed) return;
  composed = true;

  // Fail on the first request rather than on the first query: a
  // missing DATABASE_URL or auth secret is a configuration error, not
  // something to discover deep inside a handler.
  assertEnv();

  // Where the framework reads the incoming request's headers from.
  // Only this line knows the app is a Next.js one; `@intelligo-dev/auth`
  // asks `@intelligo-dev/core/request-context` and stays usable from a
  // worker or a test.
  setRequestContextSource(nextRequestContext);

  setDefaultProductSlug(PRODUCT_SLUG);
  registerProductPlans(PRODUCT_SLUG, PLANS);
  registerProductFeatures(PRODUCT_SLUG, FEATURES);

  // What each model costs. The framework ships a catalogue as data and
  // registers none of it: an id with no registered price throws where
  // the price is needed, rather than being guessed. Swap in your own
  // contracted rates, or add a model the framework has never heard of,
  // by passing your own array here.
  registerModels(DEFAULT_MODELS);

  // What you bill in. Provider prices are USD, so a USD deployment
  // converts at exactly 1.0; selling in another currency means stating
  // its rate per USD here, in micros. There is no default rate — a
  // framework that guesses one is inventing money. Seeds the row once;
  // an existing row is left alone, because changing the currency under
  // a ledger that holds balances is your decision, not a deploy's.
  void ensureBillingSettingsRow({
    currency: "USD",
    usdRateMicros: 1_000_000,
    marginBp: DEFAULT_MARGIN_BP,
  });
}
```

`instrumentation.ts` calls it once per server process.

## Import side effects are banned

A registration that silently does not happen looks exactly like one that did. So no package populates a registry when it is imported — plans, features, models, renderers and document patterns are all registered explicitly, from the root.

## Ports over dependencies

Packages never reach sideways. `@intelligo-dev/auth` does not import billing; `@intelligo-dev/executions` imports nothing. Instead a service takes **ports** — functions it calls — and the composition root binds them:

<!-- snippet: packages/cli/templates/app-scaffold/intelligo.ts.tpl#executions -->

```ts title="lib/intelligo.ts"
export const executions = createExecutions({
  async checkEntitlement({ workspaceId, requestId, model }) {
    // Passing requestId makes admission atomic: the worst-case cost is
    // reserved in the same transaction that reads the balance, so
    // concurrent requests cannot all pass.
    const quota = await reserveQuota(workspaceId, { modelId: model, requestId });
    return {
      allowed: quota.allowed,
      code: quota.code,
      reason: quota.reason,
      // The hold, as an amount with its currency.
      estimated: quota.estimated,
      usingTrialCredits: quota.usingTrialCredits,
    };
  },

  async settleUsage(s) {
    // Returns what was charged and which pool funded it; the lifecycle
    // records the amount and its currency on the execution row.
    return recordTokenUsage({
      workspaceId: s.workspaceId,
      userId: s.userId ?? "",
      model: s.model ?? "unknown",
      agent: s.capability,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      totalTokens: s.totalTokens,
      usingTrialCredits: s.usingTrialCredits,
      requestId: s.requestId,
      metadata: s.metadata,
    });
  },

  async releaseHold({ requestId }) {
    await releaseReservation(requestId);
  },

  // Lets executions.reconcile() tell a settling row whose charge
  // committed from one whose charge never happened.
  findSettlement: ({ workspaceId, requestId }) =>
    findSettlementByRequestId(workspaceId, requestId),
});
```

The same pattern binds `checkMemberLimit` for the team service, `onAccountDeleted` for the profile service, and so on. Swap a port and the service follows; no package has to change.

## One package imports Next.js

Only `@intelligo-dev/next` imports `next/*`. The framework reads a request's headers through `@intelligo-dev/core/request-context`, and the root binds where they come from — `setRequestContextSource(nextRequestContext)`. Everything else stays usable from a queue worker, a Hono API or a test.

## Two thin transports

- **Server Actions** for internal UI mutations: parse → call a service → map its typed error to the UI's shape → revalidate.
- **Route Handlers** for streaming, auth, webhooks, uploads, cron and external clients.

Neither holds business rules. Those live in the package services, tested against a real database.
