/**
 * Checkout & billing overview service: Stripe checkout/portal session
 * creation, the pending credit-purchase row, and the role-shaped billing
 * overview read.
 *
 * These functions take resolved `workspaceId`/`userId`/`role` values and
 * never call `requireWorkspace`/`requireRole` (billing cannot depend on
 * auth). Every transport MUST perform that check first; this module
 * trusts its caller on identity and authorization.
 */

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
import { getStripe } from "./stripe";
import { getPlanBySlug } from "./plans";
import { planRowId } from "./plan-rows";
import { getOrCreateStripeCustomer, getWorkspaceBilling } from "./queries";

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
  | "provider_error";

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

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: stripePriceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
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
});

export type GetCheckoutSessionInput = z.infer<typeof checkoutSessionReadSchema>;

/**
 * Read a completed-or-in-flight Stripe checkout session and shape it
 * for the checkout-success page.
 *
 * The webhook can arrive after the browser redirect to
 * `/checkout/success`, so this queries Stripe directly rather than
 * trusting the local `subscriptions` row.
 */
export async function getCheckoutSession(
  input: GetCheckoutSessionInput
): Promise<CheckoutSessionSummary> {
  const { sessionId } = checkoutSessionReadSchema.parse(input);

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

// ---------------------------------------------------------------------------
// Billing overview (role-shaped read)
// ---------------------------------------------------------------------------

export type BillingRole = "member" | "admin" | "owner";

export type BillingOverviewMember = {
  role: "member";
  planName: string;
  status: string;
};

export type BillingOverviewAdmin = {
  role: "admin";
  planName: string;
  planSlug: string;
};

export type BillingOverviewOwner = {
  role: "owner";
  planName: string;
  planSlug: string;
  subscription: {
    status: string;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    stripeCustomerId: string | null;
  } | null;
  /**
   * The top-up balance, in the deployment's billing currency. `null`
   * when the workspace has no ledger row to denominate.
   */
  creditBalance: Money | null;
  billingMode: "subscription" | "credit";
};

export type BillingOverview =
  BillingOverviewMember | BillingOverviewAdmin | BillingOverviewOwner;

const billingOverviewSchema = z.object({
  workspaceId: z.string().min(1),
  role: z.enum(["member", "admin", "owner"]),
});

export type GetBillingOverviewInput = z.infer<typeof billingOverviewSchema>;

/**
 * Role-shaped billing read: `member` gets a status-only view, `admin`
 * a read-only plan name, `owner` the full subscription/credit-balance
 * detail. The caller resolves `role` from `requireWorkspace()`'s
 * membership — this module never reads a role for itself.
 */
export async function getBillingOverview(
  input: GetBillingOverviewInput
): Promise<BillingOverview> {
  const { workspaceId, role } = billingOverviewSchema.parse(input);

  const billing = await getWorkspaceBilling(workspaceId);
  const planName = billing.plan?.name ?? "Free";
  const planSlug = billing.plan?.slug ?? "free";

  if (role === "member") {
    return {
      role: "member",
      planName,
      status: billing.subscription?.status ?? "active",
    };
  }

  if (role === "admin") {
    return { role: "admin", planName, planSlug };
  }

  return {
    role: "owner",
    planName,
    planSlug,
    subscription: billing.subscription
      ? {
          status: billing.subscription.status,
          currentPeriodEnd: billing.subscription.currentPeriodEnd,
          cancelAtPeriodEnd: billing.subscription.cancelAtPeriodEnd,
          stripeCustomerId: billing.subscription.stripeCustomerId,
        }
      : null,
    creditBalance: billing.creditBalance.currency
      ? money(
          billing.creditBalance.balanceMicros,
          billing.creditBalance.currency
        )
      : null,
    billingMode: billing.billingMode,
  };
}
