/**
 * What a subscription checkout asks before it opens one: whether the
 * workspace already has a Stripe subscription that bills, and the
 * portal flow that moves it to another price instead.
 */

import type Stripe from "stripe";

import { getWorkspaceSubscription } from "./queries";
import { getStripe } from "./stripe";

type PortalParams = Stripe.BillingPortal.SessionCreateParams;

/**
 * Statuses in which the Stripe subscription still exists and bills.
 * `canceled`, `incomplete` and `incomplete_expired` are absent: nothing
 * is left to change, so those workspaces go through checkout again.
 */
const STRIPE_SUBSCRIPTION_OPEN: ReadonlySet<string> = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
]);

/**
 * The subscription that still bills this workspace: the local row's, or
 * — before its webhook lands — one Stripe already holds for the customer.
 */
export async function liveSubscription(
  workspaceId: string,
  customerId: string
): Promise<{ id: string; status: string } | null> {
  const local = (await getWorkspaceSubscription(workspaceId))?.subscription;
  if (
    local?.stripeSubscriptionId &&
    STRIPE_SUBSCRIPTION_OPEN.has(local.status)
  ) {
    return { id: local.stripeSubscriptionId, status: local.status };
  }
  const remote = await getStripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  const found = remote.data.find((sub) =>
    STRIPE_SUBSCRIPTION_OPEN.has(sub.status)
  );
  return found ? { id: found.id, status: found.status } : null;
}

export function withoutQuery(url: string): string {
  const parsed = new URL(url);
  parsed.search = "";
  return parsed.toString();
}

/**
 * The portal flow for moving a subscription to another price. Empty —
 * the portal's home — when the subscription is not in good standing, is
 * already on that price, or has no item to move.
 */
export async function planChangeFlow(params: {
  stripeSubscriptionId: string;
  status: string;
  stripePriceId: string;
  returnUrl: string;
}): Promise<Pick<PortalParams, "flow_data">> {
  if (params.status !== "active" && params.status !== "trialing") return {};

  const subscription = await getStripe().subscriptions.retrieve(
    params.stripeSubscriptionId
  );
  const item = subscription.items.data[0];
  if (!item || item.price.id === params.stripePriceId) return {};

  return {
    flow_data: {
      type: "subscription_update_confirm",
      subscription_update_confirm: {
        subscription: subscription.id,
        items: [{ id: item.id, price: params.stripePriceId, quantity: 1 }],
      },
      after_completion: {
        type: "redirect",
        redirect: { return_url: params.returnUrl },
      },
    },
  };
}
