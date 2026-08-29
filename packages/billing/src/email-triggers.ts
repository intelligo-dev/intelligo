/**
 * Billing Email Triggers
 *
 * Functions designed to be called from Phase 11's Stripe webhook handler.
 * Each function is self-contained: imports from email and notification modules
 * and handles everything needed for the email + notification workflow.
 *
 * Integration points:
 * - handleSubscriptionConfirmedEmail: call from checkout.session.completed
 *   or customer.subscription.created webhook event
 * - handlePaymentFailedEmail: call from invoice.payment_failed webhook event
 */

import { sendSubscriptionConfirmedEmail } from "@intelligo/core/email";
import { triggerPaymentFailedNotification } from "@intelligo/core/notifications";

/**
 * Called by the Stripe webhook handler when a subscription is confirmed.
 *
 * Phase 11 webhook handler should call this in the `checkout.session.completed`
 * or `customer.subscription.created` event handler.
 *
 * Sends a subscription confirmation email (EMAIL-12).
 */
export async function handleSubscriptionConfirmedEmail(params: {
  userEmail: string;
  workspaceName: string;
  planName: string;
  amount: string;
  dashboardUrl?: string;
}): Promise<void> {
  const dashboardUrl =
    params.dashboardUrl ||
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard`;

  await sendSubscriptionConfirmedEmail({
    to: params.userEmail,
    workspaceName: params.workspaceName,
    planName: params.planName,
    amount: params.amount,
    dashboardUrl,
  });
}

/**
 * Called by the Stripe webhook handler when a payment fails.
 *
 * Phase 11 webhook handler should call this in the `invoice.payment_failed`
 * event handler.
 *
 * This creates BOTH an in-app notification AND sends an email (EMAIL-11).
 * The triggerPaymentFailedNotification handles both channels internally:
 * it creates the in-app notification (awaited) and sends the email
 * (fire-and-forget).
 */
export async function handlePaymentFailedEmail(params: {
  userId: string;
  userEmail: string;
  workspaceId: string;
  workspaceName: string;
  amount: string;
}): Promise<void> {
  await triggerPaymentFailedNotification({
    userId: params.userId,
    userEmail: params.userEmail,
    workspaceId: params.workspaceId,
    workspaceName: params.workspaceName,
    amount: params.amount,
  });
}
