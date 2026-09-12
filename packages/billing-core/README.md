# @intelligo-dev/billing-core

Plan definitions, the per-product registries, and the payment provider contract.

Part of [Intelligo](https://github.com/intelligo-mn/framework), an application
framework and operational platform for vertical AI SaaS products. This package
is published from that repository and is not meant to be used on its own.

## Install

```bash
pnpm add @intelligo-dev/billing-core
```

## Why it is separate from `@intelligo-dev/billing`

Plan types have to be importable without pulling in Stripe or `server-only`.

## The registries

Everything a product configures, registered from the composition root and read
by the billing engine: plans, the feature matrix, upgrade copy, action labels,
the action-to-limit remap, the trial grant, seat limits and request ceilings.

There is no fallback catalogue. A product that registers nothing gets nothing,
and `getDefaultProductSlug()` throws `BillingNotConfiguredError` rather than
billing against an empty list.

## Licence

Apache-2.0
