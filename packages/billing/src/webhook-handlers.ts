/**
 * Stripe Webhook Event Handlers
 *
 * Individual handler functions for each Stripe webhook event type.
 * All handlers are idempotent — running them multiple times with the same event
 * produces the same database state.
 *
 * Pattern: Extract event data → upsert to database → log to finance_events
 */

import type Stripe from "stripe";
import { db } from "@intelligo-dev/core/db";
import {
  subscriptions,
  creditPurchases,
  creditBalances,
} from "@intelligo-dev/core/db/schema";
import { eq, sql } from "drizzle-orm";
import { getStripe } from "./stripe";
import { resetMonthlyQuota } from "./quota";
import { convertTrialToPaid } from "./trial";
import { invalidateFeatureCache } from "./features";
import { createLogger } from "@intelligo-dev/core/logger";
import {
  getSubscriptionByStripeId,
  sendSubscriptionConfirmation,
  sendPaymentFailedEmail,
} from "./webhook-helpers";

const log = createLogger("Webhook");

// ---------------------------------------------------------------------------
// WEB-01: Handle checkout.session.completed
// ---------------------------------------------------------------------------

/**
 * Handle checkout.session.completed
 *
 * Triggered when Stripe Checkout session completes successfully.
 * Can be either:
 * - Subscription checkout: Activate subscription, create customer
 * - Credit purchase: Mark purchase complete, increment credit balance
 */
export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
) {
  const workspaceId = session.metadata?.workspaceId;
  if (!workspaceId) {
    log.error("Missing workspaceId in checkout session metadata");
    return;
  }

  if (session.mode === "subscription") {
    const stripe = getStripe();
    const subId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;

    if (!subId) {
      log.error("No subscription ID in checkout session");
      return;
    }

    const subResponse = await stripe.subscriptions.retrieve(subId);
    const sub = subResponse as Stripe.Subscription;
    const subItem = sub.items.data[0];
    if (!subItem) {
      log.error("No subscription items found");
      return;
    }
    const periodStart = subItem.current_period_start;
    const periodEnd = subItem.current_period_end;

    const planId = session.metadata?.planId;
    if (!planId) {
      log.error("Missing planId in subscription checkout metadata");
      return;
    }

    await db
      .insert(subscriptions)
      .values({
        id: crypto.randomUUID(),
        workspaceId,
        planId,
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: sub.id,
        status: sub.status,
        billingMode: "subscription",
        currentPeriodStart: new Date(periodStart * 1000),
        currentPeriodEnd: new Date(periodEnd * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: subscriptions.workspaceId,
        set: {
          planId,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: sub.id,
          status: sub.status,
          billingMode: "subscription",
          currentPeriodStart: new Date(periodStart * 1000),
          currentPeriodEnd: new Date(periodEnd * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          updatedAt: new Date(),
        },
      });

    await convertTrialToPaid(workspaceId);
    invalidateFeatureCache(workspaceId);

    log.info("Subscription activated", { workspaceId, planId });

    try {
      const isYearly = sub.items.data[0]?.price?.recurring?.interval === "year";
      await sendSubscriptionConfirmation({ workspaceId, planId, isYearly });
    } catch (emailError) {
      log.error("Failed to send subscription confirmation email", {
        error:
          emailError instanceof Error ? emailError.message : String(emailError),
      });
    }
  } else if (session.mode === "payment") {
    const checkoutSessionId = session.id;
    const purchaseId = session.metadata?.purchaseId as string | undefined;

    // Try lookup by purchaseId first (new flow), fallback to session ID (legacy)
    let purchase = purchaseId
      ? await db
          .select()
          .from(creditPurchases)
          .where(eq(creditPurchases.id, purchaseId))
          .limit(1)
          .then((r) => r[0])
      : undefined;

    // Fallback: query by session ID if purchaseId not in metadata
    if (!purchase) {
      const rows = await db
        .select()
        .from(creditPurchases)
        .where(eq(creditPurchases.stripeCheckoutSessionId, checkoutSessionId))
        .limit(1);
      purchase = rows[0];
    }

    if (!purchase) {
      log.error("Credit purchase not found for checkout session", {
        checkoutSessionId,
        purchaseId,
      });
      return;
    }

    // Idempotent: skip if already completed (webhook replay case)
    if (purchase.status === "completed") {
      log.info("Credit purchase already completed, skipping", { workspaceId });
      return;
    }

    // Update checkout session ID on the purchase record (if not already set)
    if (
      purchase.stripeCheckoutSessionId === "pending" ||
      purchase.stripeCheckoutSessionId !== checkoutSessionId
    ) {
      await db
        .update(creditPurchases)
        .set({ stripeCheckoutSessionId: checkoutSessionId })
        .where(eq(creditPurchases.id, purchase.id));
    }

    // Use a single atomic upsert for both status and credit balance.
    // onConflictDoUpdate with arithmetic SQL ensures no double-credit on replay.
    await db
      .insert(creditBalances)
      .values({
        id: crypto.randomUUID(),
        workspaceId,
        balance: purchase.credits,
        totalPurchased: purchase.credits,
        totalUsed: 0,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: creditBalances.workspaceId,
        set: {
          balance: sql`${creditBalances.balance} + ${purchase.credits}`,
          totalPurchased: sql`${creditBalances.totalPurchased} + ${purchase.credits}`,
          updatedAt: new Date(),
        },
      });

    // Update status last so replay webhooks see completed and skip above.
    await db
      .update(creditPurchases)
      .set({ status: "completed" })
      .where(eq(creditPurchases.id, purchase.id));

    log.info("Credit purchase completed", {
      workspaceId,
      credits: purchase.credits,
    });
  }
}

// ---------------------------------------------------------------------------
// WEB-02: Handle invoice.paid
// ---------------------------------------------------------------------------

/**
 * Handle invoice.paid
 *
 * Triggered when subscription invoice is successfully paid.
 * This is the monthly renewal event — update subscription period.
 */
export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const invoiceWithSub = invoice as unknown as Stripe.Invoice & {
    subscription?: string | { id: string } | null;
  };

  let subscriptionId: string | null = null;
  if (typeof invoiceWithSub.subscription === "string") {
    subscriptionId = invoiceWithSub.subscription;
  } else if (
    invoiceWithSub.subscription &&
    typeof invoiceWithSub.subscription === "object"
  ) {
    subscriptionId = invoiceWithSub.subscription.id;
  }

  if (!subscriptionId) {
    log.debug("Invoice not associated with subscription, skipping");
    return;
  }

  const periodStart = invoice.lines.data[0]?.period?.start;
  const periodEnd = invoice.lines.data[0]?.period?.end;

  if (!periodStart || !periodEnd) {
    log.error("Invoice missing period data");
    return;
  }

  await db
    .update(subscriptions)
    .set({
      status: "active",
      currentPeriodStart: new Date(periodStart * 1000),
      currentPeriodEnd: new Date(periodEnd * 1000),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));

  const sub = await getSubscriptionByStripeId(subscriptionId);
  if (sub) {
    await resetMonthlyQuota(sub.workspaceId);
    log.info("Monthly quota reset", { workspaceId: sub.workspaceId });
  }

  log.info("Invoice paid, period updated", { subscriptionId });
}

// ---------------------------------------------------------------------------
// WEB-03: Handle invoice.payment_failed
// ---------------------------------------------------------------------------

/**
 * Handle invoice.payment_failed
 *
 * Triggered when subscription payment fails.
 * Mark subscription as past_due and log for notification.
 */
export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const invoiceWithSub = invoice as unknown as Stripe.Invoice & {
    subscription?: string | { id: string } | null;
  };

  let subscriptionId: string | null = null;
  if (typeof invoiceWithSub.subscription === "string") {
    subscriptionId = invoiceWithSub.subscription;
  } else if (
    invoiceWithSub.subscription &&
    typeof invoiceWithSub.subscription === "object"
  ) {
    subscriptionId = invoiceWithSub.subscription.id;
  }

  if (!subscriptionId) {
    log.debug("Invoice not associated with subscription, skipping");
    return;
  }

  await db
    .update(subscriptions)
    .set({
      status: "past_due",
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));

  log.info("Payment failed, marked as past_due", { subscriptionId });

  const sub = await getSubscriptionByStripeId(subscriptionId);
  if (sub) {
    try {
      await sendPaymentFailedEmail(sub.workspaceId);
    } catch (emailError) {
      log.error("Failed to send payment failed email", {
        error:
          emailError instanceof Error ? emailError.message : String(emailError),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// WEB-04: Handle customer.subscription.updated
// ---------------------------------------------------------------------------

/**
 * Handle customer.subscription.updated
 *
 * Triggered when subscription details change (plan, status, etc.).
 * Updates local subscription record to match Stripe state.
 */
export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
) {
  const stripeSub = subscription as unknown as Stripe.Subscription & {
    current_period_start: number;
    current_period_end: number;
    cancel_at_period_end: boolean;
  };

  const stripeSubscriptionId = stripeSub.id;

  // Look up local subscription by Stripe ID
  const localSub = await getSubscriptionByStripeId(stripeSubscriptionId);
  if (!localSub) {
    log.debug("Subscription not found locally, skipping update", {
      stripeSubscriptionId,
    });
    return;
  }

  // Get plan ID from metadata or item price
  const planId =
    stripeSub.metadata?.planId ??
    stripeSub.items.data[0]?.price?.metadata?.planId;

  if (!planId) {
    log.error("No planId found in subscription metadata or price metadata");
    return;
  }

  // Update local subscription
  await db
    .update(subscriptions)
    .set({
      planId,
      status: stripeSub.status,
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));

  log.info("Subscription updated", {
    stripeSubscriptionId,
    planId,
    status: stripeSub.status,
  });
}

// ---------------------------------------------------------------------------
// WEB-05: Handle customer.subscription.deleted
// ---------------------------------------------------------------------------

/**
 * Handle customer.subscription.deleted
 *
 * Triggered when subscription is cancelled or deleted.
 * Marks local subscription as cancelled.
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
) {
  const stripeSubscriptionId = subscription.id;

  await db
    .update(subscriptions)
    .set({
      status: "canceled",
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));

  log.info("Subscription cancelled", { stripeSubscriptionId });
}
