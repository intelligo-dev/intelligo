import Stripe from "stripe";

/**
 * Stripe Client
 *
 * Lazy initialization pattern — Stripe client created on first use.
 * This allows the app to boot without STRIPE_SECRET_KEY for local dev.
 * Billing features will gracefully degrade if Stripe isn't configured.
 *
 * Pattern matches OAuth conditional pattern from Phase 9 (AUTH-03).
 */

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY is not set. Add it to .env.local for billing features."
      );
    }
    _stripe = new Stripe(key, {
      apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion,
      typescript: true,
    });
  }
  return _stripe;
}
