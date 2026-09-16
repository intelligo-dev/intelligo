# ADR-0015: Money is micros with a currency attached, and a deployment declares the one it bills in

**Status:** Accepted
**Date:** 2026-09-16
**Amends:** ADR-0011's fold of `@intelligo-dev/money` into `core/money` — "a refactor that had not happened" — by performing it
**Driver:** the reference app's usage page read one Gemini Flash turn as "$15". The number was whole tugrik with a 4× margin; the card formatted it as dollars. No deployment outside Mongolia could bill correctly, and the one inside it could not say so.

## Context

Every amount in the framework was a bare `number` whose unit lived in a
field name: `charged_mnt`, `balance_mnt`, `estimatedMnt`,
`monthlyCreditMnt`, a `DEFAULT_USD_TO_MNT_RATE = 3450` and a
`formatPrice` that returned a tugrik glyph. Provider prices are quoted
in USD, so settlement multiplied by a margin and an FX rate and
`ceil`ed to a whole tugrik — a rounding step that is invisible at ₮3,450
to the dollar and catastrophic at 1:1, where every request under a
dollar bills a dollar.

Three failures followed from the same root, and none of them was a
display bug:

- **A USD deployment could not exist.** Setting the rate to 1 made the
  `ceil` charge a whole dollar per turn. Leaving it at 3450 charged
  correctly in tugrik and printed the result with a `$`.
- **A credit pack sold one unit and granted another.** Stripe charged
  `priceUsd: 5` in cents while the webhook credited `credits: 100_000`
  into `balance_mnt`. Whether that was ₮100,000 or $100,000 depended on
  a settings row nobody read at the time. Nothing in the type system
  objected, because both were `number`.
- **Sub-cent truth was unrepresentable.** A cheap turn costs a fraction
  of a cent. Whole minor units round that to zero or to one — a 100%
  error in either direction — so the only unit that could hold it was
  the tugrik scaling, by accident.

`packages/core/src/money.ts` had been written for exactly this and was
imported by nothing (ADR-0011 folded the package into a subpath on the
strength of a refactor that never followed).

## Decision

1. **An amount is micros plus a currency.** `Money = { amount: Micros;
currency: CurrencyCode }`, where micros are millionths of one major
   unit. Six decimal places hold a fraction of a cent exactly, which is
   what a turn costs; `add`/`subtract`/`compare` refuse to mix two
   currencies, so the pack that sold 100,000 of one unit for $5 of
   another no longer type-checks.

2. **The deployment declares one billing currency.**
   `billing_settings` carries `currency`, `usd_rate_micros` (what one
   USD costs in it — exactly `1_000_000` for a USD deployment) and
   `margin_bp` (basis points of a multiplier; `40_000` is 4×). There is
   no default rate anywhere: a framework that guesses an exchange rate
   is inventing money.

3. **Charge is computed, never assumed.** `providerCost(model, in, out)`
   is exact USD micros — a price per million tokens is, per token, that
   many millionths of a dollar. `chargeFor(…, rate)` applies the margin
   and converts at the deployment's own rate. Rounding is upward and
   happens only at micros, and once more at `toMinor` for a payment
   provider.

4. **Every ledger row states its currency**, and a write in another one
   is refused rather than converted — at admission, at settlement, and
   in the credit webhook, which leaves a mismatched purchase pending for
   an operator instead of guessing. Changing a deployment's currency
   under a non-empty ledger is an operator's decision, not a deploy's.

5. **A grant and a price are different amounts.** A credit bundle
   carries `grant` (Money, in the billing currency) and `price` (Money,
   in what the provider charges). They are equal only by coincidence.

6. **Display has one rule.** Amounts render through a consumer-owned
   formatter that takes its decimals from `Intl` and widens them when a
   real charge would otherwise print as zero: `$0.0048`, not `$0.00`.
   No component hardcodes a symbol; `formatPrice` is gone.

7. **The migration is two steps.** `0044_money_micros` adds the micros
   and currency columns and backfills existing rows as MNT at
   ×1,000,000 — they were tugrik, and the backfill says so. `0045` drops
   the old columns once nothing reads them. Between the two, every new
   field sits beside the old one, so each commit deploys on its own.

## Consequences

- Public types change across `executions`, `billing`, `chat` and
  `admin`: `estimatedMnt` → `estimated`, `chargedMnt` → `charged`,
  `SettlementOutcome`'s pools, `PlanConfig.monthlyAllowance`,
  `CreditBundle`. Breaking, in beta, and listed in the changelog.
- `executions/pricing` may import `core/money` and nothing else; both
  are import-free leaves, asserted on the files.
- A summary that spans currencies returns one amount per currency
  rather than a sum, because adding two currencies produces a number
  that is true of neither.
- Micros are read through drizzle as JavaScript numbers, safe to about
  9×10⁹ major units; aggregates cast in SQL and pass through `micros()`,
  which throws rather than silently truncating.
- Stripe's zero-decimal-but-divisible-by-100 currencies (HUF, TWD, UGX)
  are not modelled by `minorExponent` and need a guard before a
  deployment sells in one.
