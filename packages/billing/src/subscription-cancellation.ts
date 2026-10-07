/**
 * Ending a workspace's Stripe subscription when the workspace is deleted.
 * Takes a resolved `workspaceId`; the caller has already checked that its
 * user may delete the workspace.
 */

import { getStripe } from "./stripe";
import { getWorkspaceBilling } from "./queries";

/**
 * End a workspace's Stripe subscription at once. For a workspace about
 * to be deleted: its `subscriptions` row goes with it, and Stripe would
 * keep charging the customer for a workspace nobody can reach. A
 * workspace with no live Stripe subscription is left as it is.
 */
export async function cancelWorkspaceSubscription(
  workspaceId: string
): Promise<void> {
  const { subscription } = await getWorkspaceBilling(workspaceId);
  if (!subscription?.stripeSubscriptionId) return;
  if (subscription.status === "canceled") return;

  try {
    await getStripe().subscriptions.cancel(subscription.stripeSubscriptionId);
  } catch (error) {
    // Canceled or removed on Stripe's side already.
    if ((error as { code?: string }).code === "resource_missing") return;
    throw error;
  }
}

/**
 * The first half of ending a workspace's Stripe subscription around its
 * deletion, for the workspace service's `beforeDeleteWorkspace` port. It
 * sets the subscription to end with its current period — nothing is lost
 * if the deletion then fails — and returns what to do once the deletion's
 * outcome is known: deleted, cancel it at once; not deleted, let it renew
 * again. Returns nothing for a workspace with no live Stripe subscription.
 */
export async function beginWorkspaceSubscriptionCancellation(
  workspaceId: string
): Promise<((deleted: boolean) => Promise<void>) | undefined> {
  const { subscription } = await getWorkspaceBilling(workspaceId);
  const subscriptionId = subscription?.stripeSubscriptionId;
  if (!subscriptionId || subscription.status === "canceled") return undefined;

  const stripe = getStripe();
  const ignoreMissing = (error: unknown) => {
    // Canceled or removed on Stripe's side already.
    if ((error as { code?: string }).code === "resource_missing") return;
    throw error;
  };
  await stripe.subscriptions
    .update(subscriptionId, { cancel_at_period_end: true })
    .catch(ignoreMissing);

  return async (deleted) => {
    if (deleted) {
      await stripe.subscriptions.cancel(subscriptionId).catch(ignoreMissing);
    } else {
      await stripe.subscriptions
        .update(subscriptionId, { cancel_at_period_end: false })
        .catch(ignoreMissing);
    }
  };
}
