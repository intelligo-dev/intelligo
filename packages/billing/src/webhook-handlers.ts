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
import { and, eq, ne, sql } from "drizzle-orm";
import { getStripe } from "./stripe";
import { getProductPlans, getRegisteredProductSlugs } from "./plan-registry";
import { planRowId } from "./plan-rows";
import { getBillingSettings } from "./billing-settings";
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
// Shapes that differ between Stripe API versions
// ---------------------------------------------------------------------------

type PeriodBounds = {
  current_period_start?: number;
  current_period_end?: number;
};

/**
 * A subscription's billing period, in epoch seconds, or null when the
 * payload carries none.
 *
 * The API version pinned in `./stripe` puts the two bounds on the
 * subscription; versions from 2025-03-31 on put them on each item, which
 * is what the installed types declare and what a webhook endpoint
 * created on a newer account version delivers. Both are read, item
 * first.
 */
export function subscriptionPeriod(
  subscription: Stripe.Subscription
): { start: number; end: number } | null {
  const item = subscription.items?.data?.[0] as PeriodBounds | undefined;
  const top = subscription as unknown as PeriodBounds;
  const start = item?.current_period_start ?? top.current_period_start;
  const end = item?.current_period_end ?? top.current_period_end;
  return typeof start === "number" && typeof end === "number"
    ? { start, end }
    : null;
}

function periodColumns(subscription: Stripe.Subscription) {
  const period = subscriptionPeriod(subscription);
  if (!period) return {};
  return {
    currentPeriodStart: new Date(period.start * 1000),
    currentPeriodEnd: new Date(period.end * 1000),
  };
}

/**
 * The subscription an invoice bills: `parent.subscription_details` from
 * API version 2025-03-31 on, the top-level `subscription` before it.
 */
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = (
    invoice as unknown as { subscription?: string | { id: string } | null }
  ).subscription;
  const reference =
    invoice.parent?.subscription_details?.subscription ?? legacy ?? null;
  if (!reference) return null;
  return typeof reference === "string" ? reference : reference.id;
}

/**
 * The `plans` row for a Stripe price: the registered plan that sells
 * under it, monthly or yearly. Null when no registered plan does.
 */
export function planIdForPrice(priceId: string | undefined): string | null {
  if (!priceId) return null;
  for (const productSlug of getRegisteredProductSlugs()) {
    const catalogue = getProductPlans(productSlug) ?? {};
    for (const plan of Object.values(catalogue)) {
      if (
        plan.stripePriceIdMonthly === priceId ||
        plan.stripePriceIdYearly === priceId
      ) {
        return planRowId(plan.slug);
      }
    }
  }
  return null;
}

/**
 * The plan a Stripe subscription is on. The price it bills decides,
 * because that is what changes when a customer switches plan in the
 * portal; the `planId` metadata written at checkout is the fallback for
 * a price no registered plan carries.
 */
function resolvePlanId(
  subscription: Stripe.Subscription,
  metadataPlanId?: string | null
): string | null {
  const price = subscription.items?.data?.[0]?.price;
  return (
    planIdForPrice(price?.id) ??
    metadataPlanId ??
    subscription.metadata?.planId ??
    price?.metadata?.planId ??
    null
  );
}

// ---------------------------------------------------------------------------
// checkout.session.completed
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

    const sub = await stripe.subscriptions.retrieve(subId);

    const planId = resolvePlanId(sub, session.metadata?.planId);
    if (!planId) {
      log.error("No registered plan or planId metadata for subscription", {
        stripeSubscriptionId: sub.id,
      });
      return;
    }

    const state = {
      planId,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: sub.id,
      status: sub.status,
      billingMode: "subscription",
      ...periodColumns(sub),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      updatedAt: new Date(),
    };

    await db
      .insert(subscriptions)
      .values({
        id: crypto.randomUUID(),
        workspaceId,
        ...state,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: subscriptions.workspaceId,
        set: state,
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
    // Stripe fires checkout.session.completed for delayed-notification
    // methods before the money arrives, with payment_status "unpaid".
    // Granting on that credits a workspace for a payment that may never
    // settle — `checkout.session.async_payment_succeeded` is the event
    // that says it did.
    if (session.payment_status !== "paid") {
      log.info("Checkout completed but unpaid; no credits granted", {
        checkoutSessionId: session.id,
        paymentStatus: session.payment_status,
      });
      return;
    }

    await grantCreditPurchase(session, workspaceId);
  }
}

// ---------------------------------------------------------------------------
// checkout.session.async_payment_succeeded / async_payment_failed
// ---------------------------------------------------------------------------

/**
 * Handle checkout.session.async_payment_succeeded
 *
 * The money for a delayed-notification payment method arrived. Grants
 * the credit purchase that `checkout.session.completed` left pending.
 */
export async function handleCheckoutAsyncPaymentSucceeded(
  session: Stripe.Checkout.Session
) {
  const workspaceId = session.metadata?.workspaceId;
  if (!workspaceId) {
    log.error("Missing workspaceId in checkout session metadata");
    return;
  }
  if (session.mode !== "payment") return;

  await grantCreditPurchase(session, workspaceId);
}

/**
 * Handle checkout.session.async_payment_failed
 *
 * The delayed payment never settled. Marks the pending purchase failed;
 * a purchase that was already granted is left alone.
 */
export async function handleCheckoutAsyncPaymentFailed(
  session: Stripe.Checkout.Session
) {
  if (session.mode !== "payment") return;

  const purchase = await findCreditPurchase(session);
  if (!purchase) {
    log.error("Credit purchase not found for checkout session", {
      checkoutSessionId: session.id,
    });
    return;
  }

  await db
    .update(creditPurchases)
    .set({ status: "failed", stripeCheckoutSessionId: session.id })
    .where(
      and(
        eq(creditPurchases.id, purchase.id),
        eq(creditPurchases.status, "pending")
      )
    );

  log.info("Credit purchase payment failed", {
    workspaceId: purchase.workspaceId,
    purchaseId: purchase.id,
  });
}

/** The purchase row a session pays for: by `purchaseId` metadata, then by session id. */
async function findCreditPurchase(session: Stripe.Checkout.Session) {
  const purchaseId = session.metadata?.purchaseId;
  if (purchaseId) {
    const [byId] = await db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.id, purchaseId))
      .limit(1);
    if (byId) return byId;
  }

  const [bySession] = await db
    .select()
    .from(creditPurchases)
    .where(eq(creditPurchases.stripeCheckoutSessionId, session.id))
    .limit(1);
  return bySession ?? null;
}

class LedgerCurrencyMismatch extends Error {}

/**
 * Credit a paid purchase to the workspace, exactly once.
 *
 * `checkout.session.completed` and `async_payment_succeeded` are two
 * events with two ids, so the webhook's per-event claim does not stop
 * both from arriving here for one purchase. The purchase row is the
 * guard: it is flipped to `completed` with a conditional update, and the
 * balance is credited in the same transaction only when that update
 * changed a row.
 */
async function grantCreditPurchase(
  session: Stripe.Checkout.Session,
  workspaceId: string
) {
  const checkoutSessionId = session.id;
  const purchase = await findCreditPurchase(session);

  if (!purchase) {
    log.error("Credit purchase not found for checkout session", {
      checkoutSessionId,
      purchaseId: session.metadata?.purchaseId,
    });
    return;
  }

  if (purchase.status === "completed") {
    log.info("Credit purchase already completed, skipping", { workspaceId });
    return;
  }

  // Credit the balance admission reads and settlement debits. The
  // purchase row says what was granted and in which currency.
  const settings = await getBillingSettings();
  const grantedCurrency = purchase.grantedCurrency ?? settings.currency;
  const grantedMicros = purchase.grantedMicros ?? 0;

  if (grantedCurrency !== settings.currency) {
    // Never credit one currency into a ledger denominated in another.
    // Leave the purchase pending for an operator rather than guess a
    // rate.
    log.error("Credit purchase currency does not match the ledger", {
      workspaceId,
      purchaseId: purchase.id,
      grantedCurrency,
      ledgerCurrency: settings.currency,
    });
    return;
  }

  let granted: boolean;
  try {
    granted = await db.transaction(async (tx) => {
      const claimed = await tx
        .update(creditPurchases)
        .set({
          status: "completed",
          stripeCheckoutSessionId: checkoutSessionId,
        })
        .where(
          and(
            eq(creditPurchases.id, purchase.id),
            ne(creditPurchases.status, "completed")
          )
        )
        .returning({ id: creditPurchases.id });
      if (claimed.length === 0) return false;

      const credited = await tx
        .insert(creditBalances)
        .values({
          id: crypto.randomUUID(),
          workspaceId,
          balanceMicros: grantedMicros,
          totalPurchasedMicros: grantedMicros,
          currency: grantedCurrency,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: creditBalances.workspaceId,
          set: {
            balanceMicros: sql`${creditBalances.balanceMicros} + ${grantedMicros}`,
            totalPurchasedMicros: sql`${creditBalances.totalPurchasedMicros} + ${grantedMicros}`,
            updatedAt: new Date(),
          },
          // A ledger already denominated in something else is not this
          // purchase's to add to.
          setWhere: sql`${creditBalances.currency} = ${grantedCurrency}`,
        })
        .returning({ id: creditBalances.id });

      // Nothing credited: roll the claim back so the purchase stays
      // pending for an operator.
      if (credited.length === 0) throw new LedgerCurrencyMismatch();
      return true;
    });
  } catch (error) {
    if (!(error instanceof LedgerCurrencyMismatch)) throw error;
    log.error(
      "Workspace ledger is in another currency; purchase left pending",
      {
        workspaceId,
        purchaseId: purchase.id,
        grantedCurrency,
      }
    );
    return;
  }

  if (!granted) {
    log.info("Credit purchase already completed, skipping", { workspaceId });
    return;
  }

  log.info("Credit purchase completed", {
    workspaceId,
    grantedMicros,
    currency: grantedCurrency,
  });
}

// ---------------------------------------------------------------------------
// invoice.paid
// ---------------------------------------------------------------------------

/**
 * Handle invoice.paid
 *
 * Triggered when subscription invoice is successfully paid.
 * This is the monthly renewal event — update subscription period.
 */
export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);
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
    .where(
      and(
        eq(subscriptions.stripeSubscriptionId, subscriptionId),
        // Canceled is terminal in Stripe; a late delivery must not
        // bring the plan back.
        ne(subscriptions.status, "canceled")
      )
    );

  const sub = await getSubscriptionByStripeId(subscriptionId);
  if (sub) {
    invalidateFeatureCache(sub.workspaceId);
    await resetMonthlyQuota(sub.workspaceId);
    log.info("Monthly quota reset", { workspaceId: sub.workspaceId });
  }

  log.info("Invoice paid, period updated", { subscriptionId });
}

// ---------------------------------------------------------------------------
// invoice.payment_failed
// ---------------------------------------------------------------------------

/**
 * Handle invoice.payment_failed
 *
 * Triggered when subscription payment fails.
 * Marks the subscription past_due and tells the workspace owner.
 */
export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);
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
    invalidateFeatureCache(sub.workspaceId);
    try {
      await sendPaymentFailedEmail(sub.workspaceId, {
        amountMinor: invoice.amount_due,
        currency: invoice.currency,
      });
    } catch (emailError) {
      log.error("Failed to send payment failed email", {
        error:
          emailError instanceof Error ? emailError.message : String(emailError),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// customer.subscription.updated
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
  const stripeSubscriptionId = subscription.id;

  const localSub = await getSubscriptionByStripeId(stripeSubscriptionId);
  if (!localSub) {
    log.debug("Subscription not found locally, skipping update", {
      stripeSubscriptionId,
    });
    return;
  }

  // Status and period follow Stripe even when the plan cannot be
  // resolved; the stored plan is then kept.
  const planId = resolvePlanId(subscription);
  if (!planId) {
    log.error("No registered plan or planId metadata for subscription", {
      stripeSubscriptionId,
    });
  }

  await db
    .update(subscriptions)
    .set({
      ...(planId ? { planId } : {}),
      status: subscription.status,
      ...periodColumns(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
        ne(subscriptions.status, "canceled")
      )
    );

  invalidateFeatureCache(localSub.workspaceId);

  log.info("Subscription updated", {
    stripeSubscriptionId,
    planId: planId ?? localSub.planId,
    status: subscription.status,
  });
}

// ---------------------------------------------------------------------------
// customer.subscription.deleted
// ---------------------------------------------------------------------------

/**
 * Handle customer.subscription.deleted
 *
 * Triggered when the subscription ends — at once, or at the period end
 * when it was set to cancel then. Marks the local subscription
 * `canceled`, which resolves the workspace to the free plan.
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
) {
  const stripeSubscriptionId = subscription.id;

  const ended = await db
    .update(subscriptions)
    .set({
      status: "canceled",
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .returning({ workspaceId: subscriptions.workspaceId });

  for (const row of ended) invalidateFeatureCache(row.workspaceId);

  log.info("Subscription cancelled", { stripeSubscriptionId });
}
