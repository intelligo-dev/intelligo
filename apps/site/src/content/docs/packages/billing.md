---
title: "@intelligo-dev/billing"
description: "Plans, feature gates, quotas, credits with reservations, trials, Stripe and rate limits."
order: 3
label: billing
---

## Install

```bash
pnpm add @intelligo-dev/billing
```

## Capabilities

- A plan registry your product registers into: plans are data, never hardcoded in the framework — reachable from a client bundle through subpaths that import neither Stripe nor `server-only`
- Feature gates, per-feature quotas, monthly token quotas with grace overage, per-workspace rate limiting
- Credit balances with worst-case **reservations**: funds held for the duration of a run, released on failure, expired on a TTL if the run dies
- Trials with provisioning, per-email abuse checks, expiry processing, and conversion to paid
- Stripe subscriptions, one-time credit packs, billing portal, and webhooks made idempotent through a finance-event ledger — plus a provider seam for regional payment providers Stripe doesn't cover
- Billing views shaped server-side per role (member / admin / owner)

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

[npm](https://www.npmjs.com/package/@intelligo-dev/billing) · [source](https://github.com/intelligo-mn/framework/tree/main/packages/billing)
