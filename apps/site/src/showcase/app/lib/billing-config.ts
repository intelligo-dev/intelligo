/**
 * Client-safe billing configuration for this deployment.
 *
 * Split from `lib/billing.ts` (which is `server-only`) so client
 * components — the credit-bundle cards, for example — can read the
 * packaging without pulling the plan registry or Stripe into the
 * browser bundle. Validation of a bundle happens server-side when the
 * checkout action passes it to `createCreditCheckout`.
 *
 * `CREDIT_BUNDLES` is the one-time credit packaging this deployment sells — product
 * config, not framework policy. Edit or empty the list to match what
 * you actually sell.
 *
 * No user-facing copy owned by this item lives in this file. The
 * `name` field on each bundle is deployment config rendered verbatim
 * by `credit-bundles.tsx` (`billing-settings` item) — it is not routed
 * through `messages/en.json`; localize it here if this
 * deployment needs bundle names in more than one language.
 */

import { fromMajor } from "@intelligo-dev/core/money";
import type { CreditBundle } from "@intelligo-dev/billing";

/**
 * ISO 4217 code for the currency this deployment charges and displays
 * in. Every money figure in the installed pages formats through
 * next-intl against this — plan prices, credit bundles, usage charges,
 * the dashboard's monthly total — so there is one place to change it
 * and no hardcoded symbol anywhere in a component.
 *
 * It must match what your payment provider actually charges in, and
 * the currency your settlement math produces: `@intelligo-dev/billing`
 * converts raw model cost with the `usdRateMicros` on the billing
 * settings row (`ensureBillingSettingsRow`, editable from the admin
 * console). A deployment that charges in USD sets that rate to 1; one
 * that charges in another currency sets it to that currency's rate per
 * USD. This constant only decides how the resulting number is
 * *displayed* — it does not convert anything.
 */
export const CURRENCY = "USD";

/**
 * Each pack states what it costs and what it grants, separately: the
 * buyer is charged `price` through the payment provider, and the
 * workspace receives `grant` in this deployment's billing currency.
 * They are the same currency here only because this deployment sells
 * and bills in dollars.
 */
export const CREDIT_BUNDLES: CreditBundle[] = [
  {
    id: "credits-small",
    name: "Small credit pack",
    grant: fromMajor(5, CURRENCY),
    price: fromMajor(5, "USD"),
  },
  {
    id: "credits-medium",
    name: "Medium credit pack",
    grant: fromMajor(13, CURRENCY),
    price: fromMajor(12, "USD"),
  },
  {
    id: "credits-large",
    name: "Large credit pack",
    grant: fromMajor(40, CURRENCY),
    price: fromMajor(35, "USD"),
  },
];

export function getCreditBundle(id: string): CreditBundle | undefined {
  return CREDIT_BUNDLES.find((bundle) => bundle.id === id);
}
