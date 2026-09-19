---
title: Credits and money
description: How an amount is represented, which pools a turn draws from, how provider cost becomes a charge, and what the workspace sees of it.
order: 6
---

A credit is money: an integer number of micros in the one currency your deployment bills in. After this page you can follow a single AI turn from the provider's price to the workspace's balance. The scaffold already bills in USD at four times provider cost, with the allowances in `lib/plans.ts`.

## Money is micros with a currency

`@intelligo-dev/core/money` represents every amount as a `Money`: an integer count of millionths of one major unit, and the ISO-4217 code it is denominated in. Micros, because one turn on a cheap model costs a fraction of a cent. The currency travels with the amount, so `add`, `subtract` and `compare` throw a `MoneyError` with code `currency_mismatch` rather than treat euros as dollars.

```ts title="lib/example.ts"
import {
  add,
  convert,
  formatMoney,
  fromMajor,
  toMinor,
} from "@intelligo-dev/core/money";

const total = add(fromMajor(15, "USD"), fromMajor(5, "USD"));
// { amount: 20_000_000, currency: "USD" }

formatMoney(total, "en-US"); // "$20.00"
toMinor(total); // 2000, the integer a payment provider takes

add(total, fromMajor(10, "EUR")); // throws MoneyError: currency_mismatch
convert(total, "EUR", 920_000); // 18_400_000 micros EUR, at a rate you state
```

| Function                          | What it does                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `money`, `fromMajor`, `fromMinor` | Build an amount from micros, major units (`12.34`) or minor units (`1234`)     |
| `toMajor`, `toMinor`              | Read it back; `toMinor` rounds up and knows zero- and three-decimal currencies |
| `add`, `subtract`, `compare`      | Same-currency arithmetic; a mismatch throws                                    |
| `multiply`                        | Scale by a plain factor, rounding up                                           |
| `convert`                         | Change currency at an explicit rate in micros; there is no default rate        |
| `formatMoney`                     | Format for a locale; sub-cent amounts keep two significant digits              |

## The three pools

A workspace spends from three pools, all in the deployment's billing currency.

| Pool           | Where it comes from                                                                                                                     | Stored in                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Plan allowance | `monthlyAllowance` on the workspace's plan in `lib/plans.ts`                                                                            | `monthly_usage`, one row a month |
| Top-up balance | Credit bundles bought through checkout; the Stripe webhook adds each bundle's `grant`                                                   | `credit_balances`                |
| Trial grant    | `registerTrialConfig` in the composition root, provisioned by `provisionTrialCredits` from `lib/workspace-bootstrap.ts`; off by default | `trial_credits`                  |

Admission sums all three. Settlement charges the plan allowance first and sends whatever is left to exactly one other pool: the top-up balance, or the trial grant when the turn was admitted on trial credits and the grant still covers the remainder. The trial is the fallback, used only when allowance plus top-ups cannot cover a turn. `SettlementOutcome` reports the split, and `charged` always equals `plan` + `topup` + `trial`.

The allowance is counted per calendar month, in UTC, so every host agrees on where a month starts. `monthly_usage` holds one row per workspace per month, a new month starts from zero, and unused allowance does not carry over. `resetMonthlyQuota`, which the Stripe webhook calls on `invoice.paid`, creates the current month's row when it is missing; it does not clear a row that exists. Top-ups and the trial grant do not reset.

A plan's `monthlyAllowance` must name the billing currency. If it names another, the allowance counts as zero, because converting it would mean inventing a rate.

## One turn, in money

[The execution boundary](/docs/concepts/execution-boundary) describes the lifecycle. In money terms, with the scaffold's bindings:

1. **Admit.** `checkEntitlement` calls `reserveQuota`. Under a per-workspace lock it reads the pools, subtracts other active reservations, and compares what remains with `estimateWorstCaseCharge`: the model's `maxOutputTokens` against a 16,000-token input budget. If the turn fits, it inserts a reservation for that amount. On `google/gemini-2.5-flash` at the defaults the hold is about $0.10.
2. **Settle.** `settleUsage` calls `recordTokenUsage`, which prices the real tokens with `chargeFor`, writes a `usage_records` row, debits the pools and settles the reservation in one transaction.
3. **Fail.** `releaseHold` calls `releaseReservation`. Nothing is charged. A reservation nobody settles stops counting after ten minutes (`RESERVATION_TTL_MS`).

A refusal carries a stable code:

<!-- snippet: packages/billing/src/quota-types.ts#QuotaRefusalCode -->

```ts
export type QuotaRefusalCode =
  | "insufficient_credits"
  | "allowance_depleted"
  | "billing_not_configured"
  | "unknown_model";
```

| Code                     | Meaning                                                                            | From `/api/chat`             |
| ------------------------ | ---------------------------------------------------------------------------------- | ---------------------------- |
| `insufficient_credits`   | Some balance remains, but less than the worst-case charge of one turn on the model | 402 `QUOTA_EXCEEDED`         |
| `allowance_depleted`     | Nothing remains in any pool                                                        | 402 `QUOTA_EXCEEDED`         |
| `unknown_model`          | The model id has no registered price, so the turn cannot be estimated              | 503 `MODEL_UNAVAILABLE`      |
| `billing_not_configured` | No product or plans are registered                                                 | 503 `BILLING_NOT_CONFIGURED` |

The chat transport puts the code in the response body as `reasonCode`. `estimateQuota` makes the same decision without locking or reserving; it is for banners and previews and must never gate a run.

## From provider cost to charge

Providers quote USD per million tokens. `chargeFor` multiplies tokens by the registered price, applies the margin, then converts into the billing currency. Both steps round up.

<!-- snippet: packages/executions/src/pricing.ts#BillingRate -->

```ts
export type BillingRate = {
  currency: CurrencyCode;
  usdRateMicros: number;
  marginBp: number;
};
```

| Field           | Meaning                                                           | Scaffold value                 |
| --------------- | ----------------------------------------------------------------- | ------------------------------ |
| `currency`      | What every ledger row is denominated in                           | `"USD"`                        |
| `usdRateMicros` | What one USD costs in that currency, in micros; `920_000` is 0.92 | `1_000_000`                    |
| `marginBp`      | Multiplier over provider cost, in basis points; `40_000` is 4×    | `DEFAULT_MARGIN_BP` (`40_000`) |

A turn of 2,000 input and 500 output tokens on `google/gemini-2.5-flash` costs the provider 1,850 micros. At 4× that is 7,400 micros, $0.0074 charged. A euro deployment at `920_000` charges 6,808 micros EUR.

The rate is a fixed number you state, not a live feed. It lives in the single `billing_settings` row. `ensureBillingSettingsRow` in `composeIntelligo()` seeds that row and leaves an existing one alone, so editing the call after the first boot changes nothing. To change them later, call `updateBillingSettings({ usdRateMicros, marginBp })` — from an admin action or a script; it validates the values and drops the cache. Changing `currency` does not convert the balances a ledger already holds. `getBillingSettings` caches it for 60 seconds per process. Each `usage_records` row stores the provider cost, margin and rate it was charged at, so a later change never rewrites history.

## What the workspace sees

- The [usage block](/blocks/usage) shows the period's charge, tokens and runs from `summarizeExecutions`, the share of the allowance used from `getQuotaThresholds`, and the trial state. The [billing settings block](/blocks/billing-settings) shows the top-up balance and sells bundles.
- The chat page calls `getChatQuotaState`, an estimate, to show a banner before a turn would be refused.
- After each settlement `checkNotificationTriggers` runs. At 80% and 100% of the allowance, and at 20% left or depletion of a trial, the workspace owner gets an in-app notification and an email, once per period.
- `getUsageSummary` returns tokens and request counts by model, agent and day, for a dashboard of your own.

## Next

- [Models and pricing](/docs/guides/models-and-pricing): register per-model prices.
- [Plans and features](/docs/guides/plans-and-features): set the allowance each plan grants.
- [Billing with Stripe](/docs/guides/billing-stripe): sell subscriptions and top-ups.
