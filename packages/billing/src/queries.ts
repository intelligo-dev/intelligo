/**
 * Billing Query Helpers
 *
 * Workspace-scoped billing queries for subscriptions, credits, and plan limit enforcement.
 * All queries filter by workspaceId to ensure proper multi-tenant data isolation.
 *
 * Pattern: Server-side only, used by server actions and webhooks.
 */

// BILL-12: Billing mode detection
// billingMode defaults to "subscription" for all workspaces.
// When products are implemented (v0.3), the first product a workspace uses
// will determine billingMode: a subscription product or a credit-metered one.
// For now, workspace owners can switch to credit mode by purchasing credits.
// TODO(v0.3): Add setWorkspaceBillingMode() triggered by first product usage.

import { db } from "@intelligo-dev/core/db";
import {
  plans,
  subscriptions,
  creditBalances,
} from "@intelligo-dev/core/db/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "./stripe";

/**
 * Plan limits type matching PROJECT.md plan specifications
 * -1 = unlimited
 */
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
 */
export async function getWorkspaceBilling(workspaceId: string) {
  const subscriptionData = await getWorkspaceSubscription(workspaceId);
  const creditBalance = await getWorkspaceCreditBalance(workspaceId);

  // If no subscription exists, return virtual free subscription
  if (!subscriptionData) {
    // Find free plan
    const freePlan = await db
      .select()
      .from(plans)
      .where(eq(plans.slug, "free"))
      .limit(1);

    return {
      subscription: null,
      plan: freePlan[0] ?? null,
      creditBalance,
      billingMode: "subscription" as const,
    };
  }

  return {
    subscription: subscriptionData.subscription,
    plan: subscriptionData.plan,
    creditBalance,
    billingMode: subscriptionData.subscription.billingMode as
      | "subscription"
      | "credit",
  };
}

/**
 * Ensure workspace has a free subscription
 * Creates one if it doesn't exist (idempotent)
 * Used during workspace initialization
 */
export async function ensureFreeSubscription(workspaceId: string) {
  // Check if subscription already exists
  const existing = await getWorkspaceSubscription(workspaceId);
  if (existing) {
    return existing.subscription;
  }

  // Find free plan ID
  const freePlan = await db
    .select()
    .from(plans)
    .where(eq(plans.slug, "free"))
    .limit(1);

  if (!freePlan[0]) {
    throw new Error(
      "Free plan not found in database. Run seed script to create plans."
    );
  }

  // Create free subscription
  const newSubscription = await db
    .insert(subscriptions)
    .values({
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      workspaceId,
      planId: freePlan[0].id,
      status: "active",
      billingMode: "subscription",
    })
    .returning();

  return newSubscription[0];
}

/**
 * Get or create Stripe customer for workspace
 * Returns existing customerId or creates new Stripe customer and stores ID
 *
 * @param preferredLanguage - User's preferred language for Stripe invoices/receipts (I18N-12)
 */
export async function getOrCreateStripeCustomer(
  workspaceId: string,
  email: string,
  name: string,
  preferredLanguage?: string
): Promise<string> {
  const subscriptionData = await getWorkspaceSubscription(workspaceId);

  // If subscription has customerId, return it
  if (subscriptionData?.subscription?.stripeCustomerId) {
    return subscriptionData.subscription.stripeCustomerId;
  }

  // I18N-12: Set Stripe customer locale preference for invoices, receipts, and payment UI
  // This ensures Stripe-generated emails and checkout pages display in user's language
  const stripeLocale = preferredLanguage === "mn" ? "mn" : "en";

  // Create Stripe customer
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      workspaceId,
    },
    preferred_locales: [stripeLocale],
  });

  // Ensure subscription exists
  const subscription =
    subscriptionData?.subscription ??
    (await ensureFreeSubscription(workspaceId));

  if (!subscription) {
    throw new Error("Failed to create subscription for workspace");
  }

  // Update subscription with customerId
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
 * Check if workspace usage is within plan limits
 * Used to enforce plan restrictions (BILL-13)
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

  // Parse plan limits JSON
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

  // Check if over limit
  if (currentUsage >= limit) {
    return {
      allowed: false,
      limit,
      current: currentUsage,
      message: `Your ${billing.plan.name} plan allows up to ${limit} ${String(limitKey)}. Upgrade to increase your limit.`,
    };
  }

  // Under limit
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
