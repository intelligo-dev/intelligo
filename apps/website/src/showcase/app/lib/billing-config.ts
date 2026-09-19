/**
 * Client-safe billing configuration, kept apart from the `server-only`
 * `lib/billing.ts` so client components can read it without pulling
 * Stripe into the browser bundle. A bundle is validated server-side by
 * `createCreditCheckout`.
 *
 * `CREDIT_BUNDLES` is the one-time credit packs you sell; edit or empty
 * it. A bundle's `name` is rendered verbatim, not translated.
 */

import { fromMajor } from "@intelligo-dev/core/money";
import type { CreditBundle } from "@intelligo-dev/billing";

/**
 * ISO 4217 code every money figure in the installed pages is formatted
 * in. It only affects display and converts nothing: it must match what
 * your payment provider charges in, and the `usdRateMicros` on the
 * billing settings row (editable in the admin console) must convert
 * model cost into it (1 for USD).
 */
export const CURRENCY = "USD";

/**
 * The buyer is charged `price` through the payment provider; the
 * workspace receives `grant` in the billing currency. They need not be
 * the same currency.
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
