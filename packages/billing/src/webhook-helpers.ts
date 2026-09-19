/**
 * Webhook helper functions.
 *
 * Shared lookup helpers used by webhook event handlers to find
 * workspace owners, subscription details, and plan information.
 */

import { db } from "@intelligo-dev/core/db";
import {
  organization,
  member,
  users,
  subscriptions,
  plans,
} from "@intelligo-dev/core/db/schema";
import { eq, sql } from "drizzle-orm";
import { formatMoney, fromMajor, fromMinor } from "@intelligo-dev/core/money";
import { getBillingSettings } from "./billing-settings";
import {
  handlePaymentFailedEmail,
  handleSubscriptionConfirmedEmail,
} from "./email-triggers";
import { createLogger } from "@intelligo-dev/core/logger";

const log = createLogger("WebhookHelpers");

export type WorkspaceOwner = {
  email: string;
  workspaceName: string;
  userId: string;
};

/**
 * Look up workspace owner details (userId, email, workspace name).
 */
export async function getWorkspaceOwner(
  workspaceId: string
): Promise<WorkspaceOwner | null> {
  const result = await db
    .select({
      workspaceName: organization.name,
      userId: users.id,
      email: users.email,
    })
    .from(organization)
    .innerJoin(member, eq(member.organizationId, organization.id))
    .innerJoin(users, eq(users.id, member.userId))
    .where(
      sql`${organization.id} = ${workspaceId} AND ${member.role} = 'owner'`
    )
    .limit(1);

  if (!result[0]) return null;
  return {
    userId: result[0].userId,
    email: result[0].email,
    workspaceName: result[0].workspaceName,
  };
}

export type PlanDetails = {
  name: string;
  priceMonthly: number;
  priceYearly: number;
};

/**
 * Look up plan details by plan ID.
 */
export async function getPlanDetails(
  planId: string
): Promise<PlanDetails | null> {
  const [plan] = await db
    .select({
      name: plans.name,
      priceMonthly: plans.priceMonthly,
      priceYearly: plans.priceYearly,
    })
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);
  return plan ?? null;
}

/**
 * Look up subscription by Stripe subscription ID.
 */
export async function getSubscriptionByStripeId(stripeSubscriptionId: string) {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  return sub ?? null;
}

/**
 * Look up subscription by Stripe customer ID.
 */
export async function getSubscriptionByCustomer(stripeCustomerId: string) {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return sub ?? null;
}

/**
 * Send subscription confirmation email.
 */
export async function sendSubscriptionConfirmation(params: {
  workspaceId: string;
  planId: string;
  isYearly: boolean;
}) {
  const owner = await getWorkspaceOwner(params.workspaceId);
  if (!owner) {
    log.error("Workspace owner not found for subscription email");
    return;
  }

  const planDetails = await getPlanDetails(params.planId);
  if (!planDetails) {
    log.error("Plan not found for subscription email");
    return;
  }

  // The plans table stores a bare number; it is whole units of whatever
  // the deployment bills in, which is the one place that says so.
  const settings = await getBillingSettings();
  const amount = formatMoney(
    fromMajor(
      params.isYearly ? planDetails.priceYearly : planDetails.priceMonthly,
      settings.currency
    ),
    "en-US"
  );

  await handleSubscriptionConfirmedEmail({
    userEmail: owner.email,
    workspaceName: owner.workspaceName,
    planName: planDetails.name,
    amount,
  });

  log.info("Subscription confirmation email sent", { email: owner.email });
}

/**
 * Tell the workspace owner a renewal payment failed: an in-app
 * notification and an email, for the invoice's amount in its currency.
 */
export async function sendPaymentFailedEmail(
  workspaceId: string,
  invoice: { amountMinor: number; currency: string }
) {
  const owner = await getWorkspaceOwner(workspaceId);
  if (!owner) {
    log.error("Workspace owner not found for payment failed email");
    return;
  }

  await handlePaymentFailedEmail({
    userId: owner.userId,
    userEmail: owner.email,
    workspaceId,
    workspaceName: owner.workspaceName,
    amount: formatMoney(
      fromMinor(invoice.amountMinor, invoice.currency.toUpperCase()),
      "en-US"
    ),
  });
}
