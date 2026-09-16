/**
 * Stripe webhook receiver.
 *
 * `createStripeWebhookHandler()` returns a Route Handler that verifies
 * the signature, records the event, dispatches it to the handlers in
 * `./webhook-handlers`, and answers Stripe the way Stripe expects:
 *
 * - **Receipt first.** A `finance_events` row is written *before* any
 *   handler runs, keyed by Stripe's event id. A delivery whose handler
 *   throws is therefore never "lost" — the row exists with no
 *   `processed_at`, and the next delivery claims it again.
 * - **Claim, then process.** Processing is gated on an `UPDATE …
 *   WHERE processed_at IS NULL` claim, so two concurrent deliveries of
 *   one event run the handlers once. A failed run releases the claim.
 * - **Fail loudly.** A handler error returns 500. Stripe retries on
 *   non-2xx; answering 202 to an error (the earlier pattern) told
 *   Stripe the event was handled and silently dropped it.
 * - A bad or missing signature is 400 — that is Stripe's own contract,
 *   and it reveals nothing a caller without the secret did not know.
 *
 * Out of scope, deliberately: ordering between events. Stripe does not
 * guarantee it, and the subscription handlers upsert the latest state
 * they are given; a deployment that needs stricter sequencing compares
 * `event.created` against the row it is about to overwrite.
 */

import type Stripe from "stripe";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@intelligo-dev/core/db";
import { financeEvents } from "@intelligo-dev/core/db/schema";
import { createLogger } from "@intelligo-dev/core/logger";

import { getStripe } from "./stripe";
import {
  handleCheckoutCompleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
} from "./webhook-handlers";

const log = createLogger("StripeWebhook");

/** Stripe events are typically < 4 KB; anything larger is stored as a preview. */
const METADATA_MAX_BYTES = 16 * 1024;

export type StripeWebhookOptions = {
  /** Defaults to `process.env.STRIPE_WEBHOOK_SECRET`. */
  secret?: string;
  /**
   * Handle an event type the built-in dispatch does not. Called for
   * every event after the built-in handler (if any); throw to fail the
   * delivery and have Stripe retry.
   */
  onEvent?: (event: Stripe.Event) => Promise<void>;
};

function extractWorkspaceId(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as Record<string, unknown>;
  const metadata = obj.metadata as Record<string, unknown> | undefined;
  if (metadata?.workspaceId) return String(metadata.workspaceId);
  const sub = obj.subscription as
    | { metadata?: Record<string, unknown> }
    | undefined;
  if (sub && typeof sub === "object" && sub.metadata?.workspaceId) {
    return String(sub.metadata.workspaceId);
  }
  const customer = obj.customer as
    | { metadata?: Record<string, unknown> }
    | undefined;
  if (
    customer &&
    typeof customer === "object" &&
    customer.metadata?.workspaceId
  ) {
    return String(customer.metadata.workspaceId);
  }
  return null;
}

function extractAmount(event: Stripe.Event): number | null {
  const obj = event.data.object as unknown as Record<string, unknown>;
  if (typeof obj.amount_paid === "number") return obj.amount_paid;
  if (typeof obj.amount_total === "number") return obj.amount_total;
  return null;
}

function serializeEvent(event: Stripe.Event): string {
  const raw = JSON.stringify(event.data.object);
  if (raw.length <= METADATA_MAX_BYTES) return raw;
  log.warn("Stripe event metadata truncated", {
    eventId: event.id,
    eventType: event.type,
    originalBytes: String(raw.length),
  });
  return JSON.stringify({
    truncated: true,
    originalBytes: raw.length,
    preview: raw.slice(0, 1024),
    eventType: event.type,
  });
}

/** Built-in dispatch. Unknown types are recorded and acknowledged. */
export async function dispatchStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session
      );
      return;
    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      return;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      return;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      return;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      return;
    default:
      log.debug("Unhandled event type", { eventType: event.type });
  }
}

/**
 * Record the receipt (idempotent on event id) and try to claim it for
 * processing. Returns false when another delivery already processed
 * it — or is processing it right now.
 */
async function claimEvent(event: Stripe.Event): Promise<boolean> {
  await db
    .insert(financeEvents)
    .values({
      id: crypto.randomUUID(),
      workspaceId: extractWorkspaceId(event),
      stripeEventId: event.id,
      type: event.type,
      amountMinor: extractAmount(event),
      currency: (event.data.object as { currency?: string }).currency ?? "usd",
      metadata: serializeEvent(event),
      processedAt: null,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: financeEvents.stripeEventId });

  const claimed = await db
    .update(financeEvents)
    .set({ processedAt: new Date() })
    .where(
      and(
        eq(financeEvents.stripeEventId, event.id),
        isNull(financeEvents.processedAt)
      )
    )
    .returning({ id: financeEvents.id });
  return claimed.length > 0;
}

async function releaseClaim(event: Stripe.Event): Promise<void> {
  await db
    .update(financeEvents)
    .set({ processedAt: null })
    .where(eq(financeEvents.stripeEventId, event.id));
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export function createStripeWebhookHandler(
  options: StripeWebhookOptions = {}
): (request: Request) => Promise<Response> {
  return async function POST(request: Request): Promise<Response> {
    const secret = options.secret ?? process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      log.error("STRIPE_WEBHOOK_SECRET not configured");
      return json({ error: "webhook not configured" }, 500);
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) return json({ error: "missing signature" }, 400);

    const body = await request.text();
    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(body, signature, secret);
    } catch (error) {
      log.warn("Signature verification failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return json({ error: "invalid signature" }, 400);
    }

    if (!(await claimEvent(event))) {
      log.debug("Event already processed, skipping", { eventId: event.id });
      return json({ received: true, duplicate: true }, 200);
    }

    try {
      await dispatchStripeEvent(event);
      if (options.onEvent) await options.onEvent(event);
    } catch (error) {
      log.error("Error processing event — releasing for retry", {
        eventId: event.id,
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error),
      });
      await releaseClaim(event).catch((releaseError) =>
        log.error("Could not release event claim", {
          eventId: event.id,
          error:
            releaseError instanceof Error
              ? releaseError.message
              : String(releaseError),
        })
      );
      return json({ error: "processing failed" }, 500);
    }

    log.info("Processed event", { eventType: event.type, eventId: event.id });
    return json({ received: true }, 200);
  };
}
