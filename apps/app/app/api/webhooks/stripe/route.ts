/**
 * Stripe webhook endpoint.
 *
 * Point Stripe at POST /api/webhooks/stripe and set
 * STRIPE_WEBHOOK_SECRET. The handler verifies the signature, records
 * every event in `finance_events` before processing it, runs the
 * built-in handlers (checkout completed, invoice paid / failed,
 * subscription updated / deleted), and answers 500 on a handler error
 * so Stripe retries — see `createStripeWebhookHandler` in
 * `@intelligo-dev/billing` for the exact contract.
 *
 * Pass `onEvent` to react to event types the framework does not.
 */

import { createStripeWebhookHandler } from "@intelligo-dev/billing";

import { composeIntelligo } from "@/lib/intelligo";

const handler = createStripeWebhookHandler();

export async function POST(request: Request) {
  composeIntelligo();
  return handler(request);
}
