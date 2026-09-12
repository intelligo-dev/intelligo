# @intelligo-dev/billing

Quota engine, credits, Stripe, feature gates, trials and rate limiting.

Part of [Intelligo](https://github.com/intelligo-mn/framework), an application
framework and operational platform for vertical AI SaaS products. This package
is published from that repository and is not meant to be used on its own.

## Install

```bash
pnpm add @intelligo-dev/billing
```

## What it owns

Admission (`estimateQuota` / `reserveQuota`) and settlement, the credit ledger,
Stripe checkout and the webhook receiver, feature gating, trial grants and
expiry, and per-plan rate limits.

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

## The webhook receiver

`createStripeWebhookHandler` verifies the signature before anything else,
writes the receipt before running handlers, claims the event with
`UPDATE … WHERE processed_at IS NULL` so two concurrent deliveries cannot both
run, and answers 500 on a handler error so Stripe retries. Answering 202 to an
error tells Stripe the event was handled and silently drops it.

## Licence

Apache-2.0
