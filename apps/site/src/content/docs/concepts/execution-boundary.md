---
title: The execution boundary
description: Every AI run is admitted, settled or failed exactly once — entitlement checked, worst-case cost reserved, actual usage charged — without wrapping the run.
order: 3
label: Execution boundary
---

`@intelligo-dev/executions` turns an AI run into a record the rest of the SaaS can trust: who ran what, in which workspace, whether it was allowed, what it used and what it cost ([ADR-0007](https://github.com/intelligo-mn/framework/blob/main/docs/adr/0007-execution-boundary.md)).

## The lifecycle

```ts
const run = await executions.begin({
  workspaceId,
  userId,
  capability: "support.reply", // your vocabulary
  model: "google/gemini-2.5-flash",
});
if (!run.allowed) return refuse(run.reason);
// … your framework, your code …
await run.complete({ usage, model }); // or run.fail({ error })
```

**Admit.** `begin` writes the execution row and asks the `checkEntitlement` port. With the scaffold's binding that reserves the worst-case cost of the model in the same transaction that reads the balance, so concurrent requests cannot all pass.

**Settle.** `complete` records actual tokens and cost and charges credits through `settleUsage`. Each terminal transition is claimed with a compare-and-swap, so a second `complete`, or a `fail` racing it, cannot bill twice.

**Fail.** `fail` releases the hold and records the error. A refusal leaves `allowed: false`, a stable `code` and an audit event; `complete` and `fail` are then no-ops.

**Reconcile.** `executions.reconcile()` uses `findSettlement` to tell a run whose charge committed from one abandoned mid-way. The `maintenance` feature runs it on a schedule.

## Model ids are registry keys

Every provider-prefixed model id must be registered with its per-token pricing and output budget (`@intelligo-dev/executions/pricing`). An unregistered id has no price and throws where the price is needed — guessing would run a model on one provider and bill it at another's rate. An architecture test fails the build on an unregistered literal.

## Money carries its currency

Provider prices are USD. A deployment declares the currency it bills in and its rate per USD in micros, once, through `ensureBillingSettingsRow`; costs convert through that rate plus a configurable margin, and every amount on a row says which currency it is ([ADR-0015](https://github.com/intelligo-mn/framework/blob/main/docs/adr/0015-money-is-micros-with-a-currency.md)).

## Where you call it

- **Chat** — `createChatHandler` from `@intelligo-dev/chat` calls `begin` and settles for every turn; you don't.
- **Mastra** — `runWithExecution` from `@intelligo-dev/mastra` brackets a native agent call.
- **Anything else** — call `begin`, `complete` and `fail` directly, as above.
