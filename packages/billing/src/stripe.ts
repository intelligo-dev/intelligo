import Stripe from "stripe";

/**
 * Stripe client, created lazily on first use so the app can boot
 * without STRIPE_SECRET_KEY in local dev; billing features degrade
 * gracefully when Stripe isn't configured.
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
