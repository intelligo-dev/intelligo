/**
 * What your product adds to a plan card, without editing
 * `components/billing/plan-card.tsx`.
 *
 *  - `actions`: rendered under the card's checkout button, as another
 *    way to buy the same plan (a QR payment rail, a bank transfer, a
 *    "talk to sales" link). It appears only where the checkout button
 *    does: on a priced plan that is not the workspace's current one,
 *    for a caller allowed to change plans. It receives the plan, the
 *    selected interval, the price the card shows (major units of
 *    `CURRENCY`) and the plan's localized name.
 *
 * Empty by default: the card offers card checkout alone. To offer the
 * QR-and-poll rail, install the `payment-poll` item, price each plan in
 * its `lib/local-payment.ts`, and bind its button here:
 *
 *   import { LocalPaymentButton } from "@showcase/components/billing/local-payment-button";
 *
 *   export const planCardConfig: PlanCardConfig = {
 *     actions: ({ plan, price, planName }) => (
 *       <LocalPaymentButton reference={plan.slug} amount={price} label={planName} />
 *     ),
 *   };
 *
 * The amount is only displayed; `priceLocalPayment(reference)` prices
 * the invoice on the server. Encode the interval in the reference
 * (`${plan.slug}:${interval}`) when the two prices differ.
 */

import type { ComponentType } from "react";

import type { PlanConfig } from "@intelligo-dev/billing/plans";

export interface PlanCardActionProps {
  plan: PlanConfig;
  interval: "monthly" | "yearly";
  /** The price the card shows, in major units of `CURRENCY`. */
  price: number;
  /** The plan's name as the card renders it. */
  planName: string;
}

export interface PlanCardConfig {
  /** Rendered under the checkout button of a plan the caller can buy. */
  actions?: ComponentType<PlanCardActionProps>;
}

export const planCardConfig: PlanCardConfig = {};
