/**
 * How your product sells its credit bundles, without editing
 * `components/billing/credit-bundles.tsx`.
 *
 *  - `actions`: rendered under a bundle's purchase button, as another
 *    way to buy it (a QR payment rail, a bank transfer). It receives the
 *    bundle, its price in major units with the price's currency, and the
 *    bundle's name.
 *  - `cardCheckout`: `false` hides the card (Stripe) purchase button, for
 *    a deployment that sells bundles only another way. Default `true`.
 *
 * Empty by default: bundles are bought by card alone. To sell them
 * through the QR-and-poll rail, install the `payment-poll` item, price
 * each bundle in its `lib/local-payment.ts` (by `getCreditBundle(reference)`),
 * and bind its button here:
 *
 *   import { LocalPaymentButton } from "@showcase/components/billing/local-payment-button";
 *
 *   export const creditBundleConfig: CreditBundleConfig = {
 *     cardCheckout: false,
 *     actions: ({ bundle, price, name }) => (
 *       <LocalPaymentButton reference={bundle.id} amount={price} label={name} />
 *     ),
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
  name: string;
}

export interface CreditBundleConfig {
  /** Rendered under each bundle's purchase button. */
  actions?: ComponentType<CreditBundleActionProps>;
  /** `false` hides the card purchase button. Default `true`. */
  cardCheckout?: boolean;
}

export const creditBundleConfig: CreditBundleConfig = {};
