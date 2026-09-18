/**
 * Billing emails, called from the Stripe webhook handlers:
 * - handleSubscriptionConfirmedEmail: checkout.session.completed or
 *   customer.subscription.created
 * - handlePaymentFailedEmail: invoice.payment_failed
 */

import { sendSubscriptionConfirmedEmail } from "@intelligo-dev/core/email";
import { triggerPaymentFailedNotification } from "@intelligo-dev/core/notifications";

/**
 * Send the subscription confirmation email. Called from the webhook
 * handler for `checkout.session.completed` or
 * `customer.subscription.created`.
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
 * Called from the webhook handler for `invoice.payment_failed`.
 *
 * Creates an in-app notification (awaited) and sends an email
 * (fire-and-forget), both through triggerPaymentFailedNotification.
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
