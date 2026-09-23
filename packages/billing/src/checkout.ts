/**
 * Checkout service: Stripe checkout/portal session creation, the pending
 * credit-purchase row, and ending a subscription. The role-shaped
 * overview read is `./billing-overview`.
 *
 * These functions take resolved `workspaceId`/`userId`/`role` values and
 * never call `requireWorkspace`/`requireRole` (billing cannot depend on
 * auth). Every transport MUST perform that check first; this module
 * trusts its caller on identity and authorization.
 */

import type Stripe from "stripe";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@intelligo-dev/core/db";
import { users, creditPurchases } from "@intelligo-dev/core/db/schema";
import {
  fromMajor,
  money,
  toMinor,
  type Money,
} from "@intelligo-dev/core/money";

import { getBillingSettings } from "./billing-settings";
import { getStripe, toStripeLocale } from "./stripe";
import { getPlanBySlug } from "./plans";
import { planRowId } from "./plan-rows";
import {
  getOrCreateStripeCustomer,
  getWorkspaceBilling,
  getWorkspaceSubscription,
} from "./queries";

/** Micros are millionths of one major unit; whole units × this. */
const MICROS_PER_UNIT = 1_000_000;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type BillingServiceErrorCode =
  | "invalid_plan"
  | "checkout_unavailable"
  | "invalid_bundle"
  | "no_billing_account"
  | "session_not_found"
  | "provider_error"
  | "payment_not_found"
  | "payment_mismatch"
  | "currency_mismatch";

/** Typed error every function in this module throws instead of a bare `Error`. */
export class BillingServiceError extends Error {
  readonly code: BillingServiceErrorCode;

  constructor(code: BillingServiceErrorCode, message?: string) {
    super(message ?? code);
    this.name = "BillingServiceError";
    this.code = code;
  }
}

export function isBillingServiceError(
  error: unknown
): error is BillingServiceError {
  return error instanceof BillingServiceError;
}

// ---------------------------------------------------------------------------
// Subscription checkout
// ---------------------------------------------------------------------------

const subscriptionCheckoutSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  planSlug: z.string().min(1),
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
  /** The registry product slug to resolve the plan catalogue against — see `@intelligo-dev/billing/plan-registry`. */
  productSlug: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  /** Overrides the caller's stored `users.preferredLanguage` for the Stripe checkout locale. */
  locale: z.string().min(1).optional(),
  /**
   * Where Stripe's portal returns to after a plan change on an existing
   * subscription. Defaults to `cancelUrl` without its query string.
   */
  returnUrl: z.string().url().optional(),
});

export type CreateSubscriptionCheckoutInput = z.infer<
  typeof subscriptionCheckoutSchema
>;

export type CheckoutSessionResult = { url: string };

/**
 * Create a Stripe subscription-checkout session for a plan upgrade.
 *
 * Resolves the Stripe price id through `getPlanBySlug` (the registry a
 * product registers at composition-root bootstrap). A plan
 * that exists in the registry but has no `stripePriceIdMonthly`/
 * `stripePriceIdYearly` set (the common dev-environment state, before
 * Stripe products are configured) throws `checkout_unavailable` rather
 * than reaching Stripe with an undefined price id.
 *
 * A workspace holds one Stripe subscription. When it already has one,
 * no second checkout is opened: the returned URL is a customer-portal
 * session instead — the portal's confirm-update flow for the new price
 * (Stripe shows the proration and takes the customer's consent) while
 * the subscription is `active` or `trialing`, the portal's home while a
 * payment is outstanding, since that is what has to be settled first.
 * Stripe is asked as well as the local row, which the webhook fills in
 * after the redirect. Any subscription checkout still open for the
 * customer is expired before a new one is created, so two tabs cannot
 * both be paid.
 */
export async function createSubscriptionCheckout(
  input: CreateSubscriptionCheckoutInput
): Promise<CheckoutSessionResult> {
  const {
    workspaceId,
    userId,
    planSlug,
    interval,
    productSlug,
    successUrl,
    cancelUrl,
    locale,
    returnUrl,
  } = subscriptionCheckoutSchema.parse(input);

  const planConfig = getPlanBySlug(planSlug, productSlug);
  if (!planConfig) {
    throw new BillingServiceError(
      "invalid_plan",
      `No plan "${planSlug}" is registered for product "${productSlug}".`
    );
  }

  const stripePriceId =
    interval === "yearly"
      ? planConfig.stripePriceIdYearly
      : planConfig.stripePriceIdMonthly;

  if (!stripePriceId) {
    throw new BillingServiceError(
      "checkout_unavailable",
      `Plan "${planSlug}" has no Stripe price configured for the ${interval} interval yet. Contact support to finish setting up Stripe products.`
    );
  }

  const [userRow] = await db
    .select({
      email: users.email,
      name: users.name,
      preferredLanguage: users.preferredLanguage,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const customerId = await getOrCreateStripeCustomer(
    workspaceId,
    userRow?.email ?? "",
    userRow?.name ?? "",
    locale ?? userRow?.preferredLanguage ?? "en"
  );

  const planId = planRowId(planSlug);
  const stripeLocale = toStripeLocale(
    locale ?? userRow?.preferredLanguage ?? undefined
  );

  const stripe = getStripe();

  const live = await liveSubscription(workspaceId, customerId);
  if (live) {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl ?? withoutQuery(cancelUrl),
      locale: stripeLocale as PortalLocale,
      ...(await planChangeFlow({
        stripeSubscriptionId: live.id,
        status: live.status,
        stripePriceId,
        returnUrl: returnUrl ?? withoutQuery(cancelUrl),
      })),
    });
    return { url: portal.url };
  }

  const open = await stripe.checkout.sessions.list({
    customer: customerId,
    status: "open",
    limit: 100,
  });
  for (const pending of open.data) {
    if (pending.mode === "subscription") {
      await stripe.checkout.sessions.expire(pending.id);
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: stripePriceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    locale: stripeLocale as CheckoutLocale,
    metadata: { workspaceId, planId },
    subscription_data: {
      metadata: { workspaceId, planId },
    },
  });

  if (!session.url) {
    throw new BillingServiceError(
      "provider_error",
      "Stripe did not return a checkout URL."
    );
  }

  return { url: session.url };
}

type CheckoutLocale = Stripe.Checkout.SessionCreateParams.Locale;
type PortalParams = Stripe.BillingPortal.SessionCreateParams;
type PortalLocale = Stripe.BillingPortal.SessionCreateParams.Locale;

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
async function liveSubscription(
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

function withoutQuery(url: string): string {
  const parsed = new URL(url);
  parsed.search = "";
  return parsed.toString();
}

/**
 * The portal flow for moving a subscription to another price. Empty —
 * the portal's home — when the subscription is not in good standing, is
 * already on that price, or has no item to move.
 */
async function planChangeFlow(params: {
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

// ---------------------------------------------------------------------------
// Credit checkout
// ---------------------------------------------------------------------------

/**
 * A one-time credit bundle offered for purchase. Bundles are product
 * packaging: the caller passes the bundle it wants sold, resolved from
 * its own config; this schema only validates the shape.
 */
const moneySchema = z.object({
  /** Micros — millionths of one major unit. */
  amount: z.number().int(),
  currency: z.string().length(3),
});

/**
 * Two amounts, deliberately separate: `price` is what the buyer is
 * charged, in the currency the payment provider takes, and `grant` is
 * what the workspace receives, in the deployment's billing currency.
 *
 * The deprecated single-number shape (`credits` + `priceUsd`) is still
 * accepted; `credits` is read as whole units of the billing currency.
 */
export const creditBundleSchema = z.union([
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    grant: moneySchema,
    price: moneySchema,
  }),
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** @deprecated Whole units of the billing currency; use `grant`. */
    credits: z.number().int().positive(),
    /** @deprecated USD price; use `price`. */
    priceUsd: z.number().positive(),
  }),
]);

export type CreditBundle = z.infer<typeof creditBundleSchema>;

const creditCheckoutSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  bundle: creditBundleSchema,
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export type CreateCreditCheckoutInput = z.infer<typeof creditCheckoutSchema>;

/**
 * Create a Stripe one-time-payment checkout session for a credit
 * bundle, recording a `pending` `creditPurchases` row first so the
 * webhook has something to match against.
 */
export async function createCreditCheckout(
  input: CreateCreditCheckoutInput
): Promise<CheckoutSessionResult> {
  const parsed = creditCheckoutSchema.safeParse(input);
  if (!parsed.success) {
    throw new BillingServiceError(
      "invalid_bundle",
      parsed.error.issues[0]?.message ?? "Invalid credit bundle."
    );
  }
  const { workspaceId, userId, bundle, successUrl, cancelUrl } = parsed.data;

  const [userRow] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const customerId = await getOrCreateStripeCustomer(
    workspaceId,
    userRow?.email ?? "",
    userRow?.name ?? ""
  );

  const settings = await getBillingSettings();
  const grant: Money =
    "grant" in bundle
      ? money(bundle.grant.amount, bundle.grant.currency)
      : money(bundle.credits * MICROS_PER_UNIT, settings.currency);
  const price: Money =
    "price" in bundle
      ? money(bundle.price.amount, bundle.price.currency)
      : fromMajor(bundle.priceUsd, "USD");

  // Granting one currency into a ledger denominated in another is the
  // bug this shape exists to prevent; refuse rather than invent a rate.
  if (grant.currency !== settings.currency) {
    throw new BillingServiceError(
      "invalid_bundle",
      `This deployment bills in ${settings.currency}, so a bundle granting ${grant.currency} cannot be credited to it.`
    );
  }

  const purchaseId = crypto.randomUUID();
  const priceMinor = toMinor(price);

  await db.insert(creditPurchases).values({
    id: purchaseId,
    workspaceId,
    priceMinor,
    priceCurrency: price.currency,
    grantedMicros: grant.amount,
    grantedCurrency: grant.currency,
    stripeCheckoutSessionId: "pending", // filled in by the webhook
    status: "pending",
  });

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [
      {
        price_data: {
          // The buyer is charged in the price's own currency, not in a
          // hardcoded one the deployment may not sell in.
          currency: price.currency.toLowerCase(),
          product_data: {
            name: bundle.name,
            description: `${(grant.amount / MICROS_PER_UNIT).toLocaleString()} ${grant.currency} of AI credit`,
          },
          unit_amount: priceMinor,
        },
        quantity: 1,
      },
    ],
    metadata: {
      workspaceId,
      bundleId: bundle.id,
      grantedMicros: String(grant.amount),
      grantedCurrency: grant.currency,
      purchaseId,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  if (!session.url) {
    throw new BillingServiceError(
      "provider_error",
      "Stripe did not return a checkout URL."
    );
  }

  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Billing portal
// ---------------------------------------------------------------------------

const billingPortalSchema = z.object({
  workspaceId: z.string().min(1),
  returnUrl: z.string().url(),
});

export type CreateBillingPortalInput = z.infer<typeof billingPortalSchema>;

/** Create a Stripe Customer Portal session for the workspace's existing customer. */
export async function createBillingPortal(
  input: CreateBillingPortalInput
): Promise<CheckoutSessionResult> {
  const { workspaceId, returnUrl } = billingPortalSchema.parse(input);

  const billing = await getWorkspaceBilling(workspaceId);
  if (!billing.subscription?.stripeCustomerId) {
    throw new BillingServiceError(
      "no_billing_account",
      "No billing account found. Subscribe to a plan or purchase credits first."
    );
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: billing.subscription.stripeCustomerId,
    return_url: returnUrl,
  });

  return { url: session.url };
}

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

// ---------------------------------------------------------------------------
// Checkout session read (checkout-success page)
// ---------------------------------------------------------------------------

export type CheckoutSessionStatus = "complete" | "open" | "expired";

export type CheckoutSessionSummary = {
  status: CheckoutSessionStatus;
  isSubscriptionActive: boolean;
  planName: string | null;
  billingInterval: "month" | "year" | null;
  customerEmail: string | null;
};

const checkoutSessionReadSchema = z.object({
  sessionId: z.string().min(1),
  /** The caller's workspace, from `requireWorkspace()`. */
  workspaceId: z.string().min(1),
});

export type GetCheckoutSessionInput = z.infer<typeof checkoutSessionReadSchema>;

/**
 * Read a completed-or-in-flight Stripe checkout session and shape it
 * for the checkout-success page.
 *
 * The webhook can arrive after the browser redirect to
 * `/checkout/success`, so this queries Stripe directly rather than
 * trusting the local `subscriptions` row.
 *
 * A session id is a bearer reference that travels in a URL, so the
 * session must carry the caller's `workspaceId` in its metadata — both
 * checkouts in this module write it. Another workspace's session reads
 * as `session_not_found`, the same as one that does not exist.
 */
export async function getCheckoutSession(
  input: GetCheckoutSessionInput
): Promise<CheckoutSessionSummary> {
  const { sessionId, workspaceId } = checkoutSessionReadSchema.parse(input);

  const stripe = getStripe();

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "subscription.items.data.price.product"],
    });
  } catch (error) {
    throw new BillingServiceError(
      "session_not_found",
      error instanceof Error
        ? error.message
        : "Failed to retrieve the checkout session."
    );
  }

  if (session.metadata?.workspaceId !== workspaceId) {
    throw new BillingServiceError(
      "session_not_found",
      "No such checkout session."
    );
  }

  const subscription = session.subscription;
  let planName: string | null = null;
  let billingInterval: "month" | "year" | null = null;
  let isSubscriptionActive = false;

  if (
    subscription &&
    typeof subscription === "object" &&
    "items" in subscription
  ) {
    const item = subscription.items.data[0];
    const product = item?.price?.product;
    if (product && typeof product === "object" && "name" in product) {
      planName = product.name as string;
    }

    // Typed as a plain string on purpose: Stripe 22 made its enums
    // open (`"month" | "year" | (string & {})`), so a value Stripe
    // adds later still arrives, and comparing the branded member
    // against a literal narrows nothing. Widening first makes the two
    // intervals this product bills in narrow the way they read.
    const interval: string | undefined = item?.price?.recurring?.interval;
    if (interval === "month" || interval === "year") {
      billingInterval = interval;
    }

    isSubscriptionActive =
      "status" in subscription && subscription.status === "active";
  }

  const customerEmail =
    session.customer_email ?? session.customer_details?.email ?? null;

  return {
    status: (session.status ?? "open") as CheckoutSessionStatus,
    isSubscriptionActive,
    planName,
    billingInterval,
    customerEmail,
  };
}
