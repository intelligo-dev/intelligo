# @intelligo-dev/billing

Quota engine, credits, Stripe, feature gates, trials and rate limiting.

Part of [Intelligo](https://intelligo.dev), an application framework and
operational platform for vertical AI SaaS products. Every `@intelligo-dev/*`
package is released at one version and shares one database schema;
`pnpm dlx @intelligo-dev/cli@beta create my-app` installs the set an
application needs. Documentation:
[intelligo.dev/docs/packages/billing](https://intelligo.dev/docs/packages/billing).

## Install

```bash
pnpm add @intelligo-dev/billing@beta drizzle-orm stripe zod
```

`drizzle-orm`, `stripe` and `zod` are peers.

## What it owns

Admission (`estimateQuota` / `reserveQuota`) and settlement, the credit ledger,
Stripe checkout and the webhook receiver, feature gating, trial grants and
expiry, and per-plan rate limits.

## Use

The plan catalogue is the product's, registered from the composition root:

```ts
// lib/intelligo.ts
import {
  registerProductFeatures,
  registerProductPlans,
  setDefaultProductSlug,
} from "@intelligo-dev/billing/plans";
import { fromMajor } from "@intelligo-dev/core/money";

setDefaultProductSlug("acme");
registerProductPlans("acme", {
  free: {
    name: "Free",
    slug: "free",
    description: "Try it",
    priceOneTime: 0,
    targetAudience: "Everyone",
    aiModelLabel: "Base",
    monthlyAllowance: fromMajor(0.5, "USD"),
    limits: { chatMessages: 30 },
    features: ["30 messages a month"],
  },
});
registerProductFeatures("acme", { exports: ["pro"] });
```

A transport then gates on the workspace's plan:

```ts
import { requireFeature } from "@intelligo-dev/billing";

await requireFeature(workspace.id, "exports"); // throws FeatureNotAvailableError
```

A row in `feature_flags` overrides the registered matrix — `isActive: false`
is a kill switch for every plan. AI spend goes through the execution boundary
instead: the composition root binds `reserveQuota`, `recordTokenUsage` and
`releaseReservation` to the ports of
[`@intelligo-dev/executions`](https://www.npmjs.com/package/@intelligo-dev/executions),
so a run is admitted against the plan's allowance and the credit balance, and
settled exactly once.

## Subpaths that import neither Stripe nor `server-only`

| Subpath          | What                                                                          |
| ---------------- | ----------------------------------------------------------------------------- |
| `/plans`         | Plan types and the per-product plan helpers                                   |
| `/plan-registry` | Every register/clear pair: plans, features, upgrade copy, trials, rate limits |
| `/payment`       | The payment provider contract and the mock provider                           |
| `/quota-types`   | Quota result and admission types, no enforcement                              |

The four are safe to reach from a client bundle or an edge runtime. An
architecture test walks their imports so a Stripe or `server-only` import
cannot creep in.

## What a deployment bills in

`ensureBillingSettingsRow` writes the currency, the USD rate and the margin on
first boot and never touches an existing row again. After that the row changes
through `updateBillingSettings({ currency?, usdRateMicros?, marginBp? })`, which
refuses a non-positive rate or margin and an invalid currency code, and drops
the cache. Changing the currency converts nothing: balances, trial grants and
the period's allowance usage stay in the currency they were written in, and the
engine refuses a write in another one until those rows are migrated.

The plan allowance is money, so the 80% and 100% notices (in-app and email)
state an amount used out of an amount allowed. The billing period is the
calendar month in UTC (`getCurrentPeriodStart`, `getCurrentPeriodEnd`,
`getCurrentPeriodKey`), whatever zone the host runs in.

## Rate limits and the payment provider

`checkRateLimit(workspaceId, planSlug, endpoint?)` counts in the `"chat"` bucket
unless the caller names another; a route that should not spend chat's allowance
passes its own name.

`getPaymentProvider()` resolves `PAYMENT_MODE`, which defaults to `mock`.
Outside production the in-memory mock needs no registration; in production it
is refused, and any other mode must be registered from the composition root.

## The webhook receiver

`createStripeWebhookHandler` verifies the signature before anything else,
writes the receipt before running handlers, claims the event with
`UPDATE … WHERE processed_at IS NULL` so two concurrent deliveries cannot both
run, and answers 500 on a handler error so Stripe retries. Answering 202 to an
error tells Stripe the event was handled and silently drops it.

## Licence

Apache-2.0
