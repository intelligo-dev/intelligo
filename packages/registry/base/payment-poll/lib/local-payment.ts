import "server-only";

/**
 * What a local payment buys — consumer-owned.
 *
 * Card checkout is a redirect: you send the user to the processor and
 * they come back. Most of the world's payment methods are not that.
 * QR-and-poll — QPay and SocialPay in Mongolia, PIX in Brazil, UPI in
 * India, PromptPay in Thailand — issues an invoice, shows a code the
 * user scans in their own banking app, and waits for the provider to
 * say it was paid. `LocalPaymentModal` renders that flow.
 *
 * The framework does the rest: `@intelligo-dev/billing` issues the
 * invoice through the provider your composition root registered
 * (`registerPaymentProvider`, selected by PAYMENT_MODE; outside
 * production an unset PAYMENT_MODE is an in-memory mock), records it
 * against the caller's workspace, and when the provider reports it
 * paid, grants what you return here once, on the server.
 *
 * This file answers one question: what does `reference` cost, and what
 * does paying it grant? It is asked when the invoice is opened and again
 * when it is settled. Price it here, never from anything the browser
 * sent: an amount that arrives as an argument is an amount the buyer
 * chose. Return null for a reference you do not sell this way.
 *
 * The default throws rather than pricing anything — a payment flow that
 * silently no-ops is worse than one that is obviously unbound.
 *
 * An implementation, over the plan catalogue:
 *
 *   const plan = getPlanBySlug(reference);
 *   if (!plan) return null;
 *   return {
 *     price: fromMajor(plan.priceOneTime, CURRENCY),
 *     grant: { plan: plan.slug },
 *     description: plan.name,
 *   };
 *
 * or one of the pricing item's `CREDIT_BUNDLES`, sold from
 * `lib/credit-bundle-config.tsx` under a `credits:` reference so a bundle
 * id never reads as a plan slug. The provider charges in `CURRENCY`: a
 * bundle priced in another currency (the card processor's) is not sold
 * this way — `money(bundle.price…)` would hand the provider a number in
 * the wrong unit.
 *
 *   if (reference.startsWith("credits:")) {
 *     const bundle = getCreditBundle(reference.slice("credits:".length));
 *     if (!bundle || !("grant" in bundle)) return null;
 *     if (bundle.price.currency !== CURRENCY) return null;
 *     return {
 *       price: money(bundle.price.amount, bundle.price.currency),
 *       grant: { credits: money(bundle.grant.amount, bundle.grant.currency) },
 *       description: bundle.name,
 *     };
 *   }
 *
 * A grant of credits is in the deployment's billing currency. A provider
 * registered with its `currency` refuses a price in any other.
 */

import type { LocalPaymentOffer } from "@intelligo-dev/billing";

export async function priceLocalPayment(
  _reference: string
): Promise<LocalPaymentOffer | null> {
  throw new Error(
    "priceLocalPayment is not bound. Implement it in lib/local-payment.ts " +
      "with what each reference costs and grants, or remove the payment-poll item."
  );
}
