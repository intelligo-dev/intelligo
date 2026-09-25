/**
 * How your product sells its credit bundles, without editing
 * `components/billing/credit-bundles.tsx`.
 *
 *  - `actions`: rendered under a bundle's purchase button, as another
 *    way to buy it (a QR payment rail, a bank transfer). It receives the
 *    bundle, its price in major units with the price's currency, and the
 *    bundle's name. Bundles in the legacy `{ credits, priceUsd }` shape
 *    are sold by card only and get no actions.
 *  - `cardCheckout`: `false` hides the card (Stripe) purchase button, for
 *    a deployment that sells bundles only another way. With no `actions`
 *    as well, nothing can buy a bundle.
 *
 * Empty by default: bundles are bought by card alone. To sell them
 * through the QR-and-poll rail, install the `payment-poll` item, price
 * each bundle in its `lib/local-payment.ts`, and bind its button here.
 * A bundle's `price` is what the card processor charges; the QR provider
 * charges in `CURRENCY`, so offer the button only for a bundle priced in
 * it, and give its reference a prefix plans do not use:
 *
 *   import { LocalPaymentButton } from "@/components/billing/local-payment-button";
 *   import { CURRENCY } from "@/lib/billing-config";
 *
 *   export const creditBundleConfig: CreditBundleConfig = {
 *     actions: ({ bundle, price, currency, bundleName }) =>
 *       currency === CURRENCY ? (
 *         <LocalPaymentButton
 *           reference={`credits:${bundle.id}`}
 *           amount={price}
 *           label={bundleName}
 *         />
 *       ) : null,
 *   };
 *
 * The amount is only displayed; `priceLocalPayment(reference)` prices
 * the invoice on the server.
 */

import type { ComponentType } from "react";

import type { CreditBundle } from "@intelligo-dev/billing";

export interface CreditBundleActionProps {
  bundle: CreditBundle;
  /** What the buyer pays, in major units of `currency`. */
  price: number;
  currency: string;
  /** The bundle's name as the card renders it. */
  bundleName: string;
}

export interface CreditBundleConfig {
  /** Rendered under each bundle's purchase button. */
  actions?: ComponentType<CreditBundleActionProps>;
  /** `false` hides the card purchase button. Default `true`. */
  cardCheckout?: boolean;
}

export const creditBundleConfig: CreditBundleConfig = {};
