/**
 * Workspace-scoped billing queries for subscriptions, credits, and plan
 * limit enforcement. All queries filter by workspaceId for tenant
 * isolation.
 */

// Billing mode: every workspace starts on "subscription"; buying credits
// switches a workspace to credit-metered billing.

import { db } from "@intelligo-dev/core/db";
import {
  plans,
  subscriptions,
  creditBalances,
} from "@intelligo-dev/core/db/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "./stripe";

/**
 * Whether a subscription in this status puts its plan in force.
 *
 * `active` and `trialing` do. So does `past_due`: the payment failed but
 * Stripe is still retrying it, and the subscription moves to `canceled`
 * or `unpaid` on its own when the retries run out. Every other status —
 * `canceled`, `unpaid`, `incomplete`, `incomplete_expired`, `paused`, or
 * one Stripe adds later — resolves to the free plan.
 */
export function subscriptionEntitles(status: string): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

async function getFreePlanRow() {
  const rows = await db
    .select()
    .from(plans)
    .where(eq(plans.slug, "free"))
    .limit(1);
  return rows[0] ?? null;
}

/** Plan limits; -1 = unlimited. */
export type QueryPlanLimits = {
  tokens: number;
  conversations: number;
  teamMembers: number;
  workspaces: number;
  documents: number;
  chatMessages?: number;
  assessments?: number;
  reports?: number;
};

/**
 * Get workspace subscription with plan details
 * Returns subscription + plan or null if no subscription exists
 */
export async function getWorkspaceSubscription(workspaceId: string) {
  const result = await db
    .select()
    .from(subscriptions)
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const row = result[0];
  if (!row) {
    return null;
  }

  return {
    subscription: row.subscriptions,
    plan: row.plans,
  };
}

/**
 * Get workspace credit balance
 * Returns balance info or default zero state if no record exists
 */
export async function getWorkspaceCreditBalance(workspaceId: string) {
  const result = await db
    .select()
    .from(creditBalances)
    .where(eq(creditBalances.workspaceId, workspaceId))
    .limit(1);

  if (result.length === 0 || !result[0]) {
    return {
      balanceMicros: 0,
      totalPurchasedMicros: 0,
      totalUsedMicros: 0,
      /** Null until a workspace has a ledger row to denominate. */
      currency: null as string | null,
    };
  }

  const record = result[0];
  return {
    balanceMicros: record.balanceMicros,
    totalPurchasedMicros: record.totalPurchasedMicros,
    totalUsedMicros: record.totalUsedMicros,
    currency: record.currency as string | null,
  };
}

/**
 * Get complete workspace billing state
 * Combines subscription + plan + credit balance
 *
 * `plan` is the plan in force: the free plan when the subscription's
 * status does not entitle (see `subscriptionEntitles`). `subscription`
 * is the stored row either way, so a caller can still show its status
 * and reach its Stripe customer.
 */
export async function getWorkspaceBilling(workspaceId: string) {
  const subscriptionData = await getWorkspaceSubscription(workspaceId);
  const creditBalance = await getWorkspaceCreditBalance(workspaceId);

  // If no subscription exists, return virtual free subscription
  if (!subscriptionData) {
    return {
      subscription: null,
      plan: await getFreePlanRow(),
      creditBalance,
      billingMode: "subscription" as const,
    };
  }

  const plan = subscriptionEntitles(subscriptionData.subscription.status)
    ? subscriptionData.plan
    : await getFreePlanRow();

  return {
    subscription: subscriptionData.subscription,
    plan,
    creditBalance,
    billingMode: subscriptionData.subscription.billingMode as
      "subscription" | "credit",
  };
}

/**
 * Ensure workspace has a free subscription
 * Creates one if it doesn't exist (idempotent)
 * Used during workspace initialization
 */
export async function ensureFreeSubscription(workspaceId: string) {
  const existing = await getWorkspaceSubscription(workspaceId);
  if (existing) {
    return existing.subscription;
  }

  const freePlan = await getFreePlanRow();

  if (!freePlan) {
    throw new Error(
      'No "free" row in the plans table. Call ensurePlanRows() from the composition root, after registerProductPlans().'
    );
  }

  const newSubscription = await db
    .insert(subscriptions)
    .values({
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      workspaceId,
      planId: freePlan.id,
      status: "active",
      billingMode: "subscription",
    })
    .returning();

  return newSubscription[0];
}

/** A BCP 47 language tag with an optional region or script: `en`, `pt-BR`. */
const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/**
 * Get or create the workspace's Stripe customer, storing its id.
 *
 * @param preferredLanguage - Locale for Stripe invoices and receipts.
 * Any language tag is passed through: Stripe takes the list as an
 * ordered preference and falls back by itself for a language it does
 * not write in.
 */
export async function getOrCreateStripeCustomer(
  workspaceId: string,
  email: string,
  name: string,
  preferredLanguage?: string
): Promise<string> {
  const subscriptionData = await getWorkspaceSubscription(workspaceId);

  if (subscriptionData?.subscription?.stripeCustomerId) {
    return subscriptionData.subscription.stripeCustomerId;
  }

  const preferredLocales =
    preferredLanguage && LANGUAGE_TAG.test(preferredLanguage)
      ? [preferredLanguage]
      : undefined;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      workspaceId,
    },
    ...(preferredLocales ? { preferred_locales: preferredLocales } : {}),
  });

  const subscription =
    subscriptionData?.subscription ??
    (await ensureFreeSubscription(workspaceId));

  if (!subscription) {
    throw new Error("Failed to create subscription for workspace");
  }

  await db
    .update(subscriptions)
    .set({
      stripeCustomerId: customer.id,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, subscription.id));

  return customer.id;
}

/**
 * Check whether workspace usage is within plan limits.
 *
 * @returns { allowed: boolean, limit: number, current: number, message?: string }
 */
export async function checkPlanLimit(
  workspaceId: string,
  limitKey: keyof QueryPlanLimits,
  currentUsage: number
): Promise<{
  allowed: boolean;
  limit: number;
  current: number;
  message?: string;
}> {
  const billing = await getWorkspaceBilling(workspaceId);

  if (!billing.plan) {
    throw new Error("No plan found for workspace");
  }

  const limits = JSON.parse(billing.plan.limits) as QueryPlanLimits;
  const limit = limits[limitKey] ?? 0;

  // Unlimited (-1) always allowed
  if (limit === -1) {
    return {
      allowed: true,
      limit: -1,
      current: currentUsage,
    };
  }

  if (currentUsage >= limit) {
    return {
      allowed: false,
      limit,
      current: currentUsage,
      message: `Your ${billing.plan.name} plan allows up to ${limit} ${String(limitKey)}. Upgrade to increase your limit.`,
    };
  }

  return {
    allowed: true,
    limit,
    current: currentUsage,
  };
}

/**
 * Get workspace plan limits as typed object
 * Useful for UI display (showing "X of Y used" on dashboard)
 */
export async function getWorkspacePlanLimits(
  workspaceId: string
): Promise<QueryPlanLimits> {
  const billing = await getWorkspaceBilling(workspaceId);

  if (!billing.plan) {
    throw new Error("No plan found for workspace");
  }

  return JSON.parse(billing.plan.limits) as QueryPlanLimits;
}
