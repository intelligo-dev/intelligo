/**
 * checkout.ts tests — Stripe/db are mocked per the package's existing
 * convention (see features.test.ts, webhook route tests): a hoisted
 * mock bag, `vi.mock` for each external module, chained
 * select/from/where/limit builders returning canned rows.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  // Stripe client
  checkoutSessionsCreate: vi.fn(),
  checkoutSessionsRetrieve: vi.fn(),
  billingPortalSessionsCreate: vi.fn(),
  getStripe: vi.fn(),

  // ./plans
  getPlanBySlug: vi.fn(),

  // ./queries
  getOrCreateStripeCustomer: vi.fn(),
  getWorkspaceBilling: vi.fn(),

  // db
  selectLimit: vi.fn(),
  selectWhere: vi.fn(),
  selectFrom: vi.fn(),
  select: vi.fn(),
  insertValues: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("./stripe", () => ({
  getStripe: mocks.getStripe,
}));

vi.mock("./plans", () => ({
  getPlanBySlug: mocks.getPlanBySlug,
}));

vi.mock("./queries", () => ({
  getOrCreateStripeCustomer: mocks.getOrCreateStripeCustomer,
  getWorkspaceBilling: mocks.getWorkspaceBilling,
}));

vi.mock("@intelligo-dev/core/db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
  },
}));

vi.mock("@intelligo-dev/core/db/schema", () => ({
  users: { id: "id", email: "email", name: "name" },
  creditPurchases: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
}));

import {
  createSubscriptionCheckout,
  createCreditCheckout,
  createBillingPortal,
  getCheckoutSession,
  getBillingOverview,
  isBillingServiceError,
} from "./checkout";

beforeEach(() => {
  vi.resetAllMocks();

  mocks.selectWhere.mockReturnValue({ limit: mocks.selectLimit });
  mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
  mocks.select.mockReturnValue({ from: mocks.selectFrom });
  mocks.selectLimit.mockResolvedValue([
    { email: "a@example.com", name: "Alice", preferredLanguage: "en" },
  ]);

  mocks.insertValues.mockResolvedValue(undefined);
  mocks.insert.mockReturnValue({ values: mocks.insertValues });

  mocks.getStripe.mockReturnValue({
    checkout: {
      sessions: {
        create: mocks.checkoutSessionsCreate,
        retrieve: mocks.checkoutSessionsRetrieve,
      },
    },
    billingPortal: {
      sessions: { create: mocks.billingPortalSessionsCreate },
    },
  });

  mocks.getOrCreateStripeCustomer.mockResolvedValue("cus_123");
});

describe("createSubscriptionCheckout", () => {
  const basePlan = {
    name: "Standard",
    slug: "standard",
    stripePriceIdMonthly: "price_monthly_123",
    stripePriceIdYearly: "price_yearly_123",
  };

  it("creates a subscription checkout session using the monthly price", async () => {
    mocks.getPlanBySlug.mockReturnValue(basePlan);
    mocks.checkoutSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_abc",
    });

    const result = await createSubscriptionCheckout({
      workspaceId: "ws_1",
      userId: "user_1",
      planSlug: "standard",
      interval: "monthly",
      productSlug: "support",
      successUrl: "https://app.example.com/checkout/success",
      cancelUrl: "https://app.example.com/pricing",
    });

    expect(result).toEqual({ url: "https://checkout.stripe.com/session_abc" });
    expect(mocks.checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_123",
        line_items: [{ price: "price_monthly_123", quantity: 1 }],
        metadata: { workspaceId: "ws_1", planId: "plan_standard" },
      })
    );
  });

  it("uses the yearly price when interval is yearly", async () => {
    mocks.getPlanBySlug.mockReturnValue(basePlan);
    mocks.checkoutSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_yearly",
    });

    await createSubscriptionCheckout({
      workspaceId: "ws_1",
      userId: "user_1",
      planSlug: "standard",
      interval: "yearly",
      productSlug: "support",
      successUrl: "https://app.example.com/checkout/success",
      cancelUrl: "https://app.example.com/pricing",
    });

    expect(mocks.checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: "price_yearly_123", quantity: 1 }],
      })
    );
  });

  it("throws invalid_plan when the plan is not registered", async () => {
    mocks.getPlanBySlug.mockReturnValue(null);

    const call = createSubscriptionCheckout({
      workspaceId: "ws_1",
      userId: "user_1",
      planSlug: "ghost",
      interval: "monthly",
      productSlug: "support",
      successUrl: "https://app.example.com/checkout/success",
      cancelUrl: "https://app.example.com/pricing",
    });

    await expect(call).rejects.toMatchObject({ code: "invalid_plan" });
    expect(mocks.checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("throws checkout_unavailable when the plan has no Stripe price configured (dev state)", async () => {
    mocks.getPlanBySlug.mockReturnValue({
      name: "Standard",
      slug: "standard",
      // No stripePriceIdMonthly/Yearly — unconfigured dev environment.
    });

    const call = createSubscriptionCheckout({
      workspaceId: "ws_1",
      userId: "user_1",
      planSlug: "standard",
      interval: "monthly",
      productSlug: "support",
      successUrl: "https://app.example.com/checkout/success",
      cancelUrl: "https://app.example.com/pricing",
    });

    await expect(call).rejects.toMatchObject({
      code: "checkout_unavailable",
    });
    expect(isBillingServiceError(await call.catch((e) => e))).toBe(true);
    expect(mocks.checkoutSessionsCreate).not.toHaveBeenCalled();
  });
});

describe("createCreditCheckout", () => {
  const bundle = {
    id: "tokens-light",
    name: "100K Tokens",
    credits: 100_000,
    priceUsd: 1.01,
  };

  it("records a pending credit purchase and creates a one-time checkout session", async () => {
    mocks.checkoutSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_credits",
    });

    const result = await createCreditCheckout({
      workspaceId: "ws_1",
      userId: "user_1",
      bundle,
      successUrl: "https://app.example.com/settings/billing?credits=success",
      cancelUrl: "https://app.example.com/settings/billing?credits=cancelled",
    });

    expect(result.url).toBe("https://checkout.stripe.com/session_credits");
    expect(mocks.insert).toHaveBeenCalled();
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws_1",
        credits: 100_000,
        amount: 101, // Math.round(1.01 * 100)
        status: "pending",
        stripeCheckoutSessionId: "pending",
      })
    );
    expect(mocks.checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        customer: "cus_123",
      })
    );
  });

  it("throws invalid_bundle on a malformed bundle", async () => {
    const call = createCreditCheckout({
      workspaceId: "ws_1",
      userId: "user_1",
      bundle: { id: "x", name: "x", credits: -1, priceUsd: 1 } as never,
      successUrl: "https://app.example.com/settings/billing",
      cancelUrl: "https://app.example.com/settings/billing",
    });

    await expect(call).rejects.toMatchObject({ code: "invalid_bundle" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("createBillingPortal", () => {
  it("creates a portal session when a Stripe customer exists", async () => {
    mocks.getWorkspaceBilling.mockResolvedValue({
      subscription: { stripeCustomerId: "cus_existing" },
    });
    mocks.billingPortalSessionsCreate.mockResolvedValue({
      url: "https://billing.stripe.com/portal_abc",
    });

    const result = await createBillingPortal({
      workspaceId: "ws_1",
      returnUrl: "https://app.example.com/settings/billing",
    });

    expect(result).toEqual({ url: "https://billing.stripe.com/portal_abc" });
    expect(mocks.billingPortalSessionsCreate).toHaveBeenCalledWith({
      customer: "cus_existing",
      return_url: "https://app.example.com/settings/billing",
    });
  });

  it("throws no_billing_account when there is no Stripe customer yet", async () => {
    mocks.getWorkspaceBilling.mockResolvedValue({ subscription: null });

    const call = createBillingPortal({
      workspaceId: "ws_1",
      returnUrl: "https://app.example.com/settings/billing",
    });

    await expect(call).rejects.toMatchObject({ code: "no_billing_account" });
    expect(mocks.billingPortalSessionsCreate).not.toHaveBeenCalled();
  });
});

describe("getCheckoutSession", () => {
  it("shapes an active subscription session", async () => {
    mocks.checkoutSessionsRetrieve.mockResolvedValue({
      status: "complete",
      customer_email: "buyer@example.com",
      subscription: {
        status: "active",
        items: {
          data: [
            {
              price: {
                recurring: { interval: "month" },
                product: { name: "Standard" },
              },
            },
          ],
        },
      },
    });

    const summary = await getCheckoutSession({ sessionId: "cs_123" });

    expect(summary).toEqual({
      status: "complete",
      isSubscriptionActive: true,
      planName: "Standard",
      billingInterval: "month",
      customerEmail: "buyer@example.com",
    });
  });

  it("throws session_not_found when Stripe retrieval fails", async () => {
    mocks.checkoutSessionsRetrieve.mockRejectedValue(
      new Error("no such session")
    );

    const call = getCheckoutSession({ sessionId: "cs_missing" });

    await expect(call).rejects.toMatchObject({ code: "session_not_found" });
  });
});

describe("getBillingOverview", () => {
  const billingState = {
    plan: { name: "Standard", slug: "standard" },
    subscription: {
      status: "active",
      currentPeriodEnd: new Date("2026-09-01"),
      cancelAtPeriodEnd: false,
      stripeCustomerId: "cus_123",
    },
    creditBalance: { balance: 4200 },
    billingMode: "subscription" as const,
  };

  it("shapes a member view with only plan name and status", async () => {
    mocks.getWorkspaceBilling.mockResolvedValue(billingState);

    const overview = await getBillingOverview({
      workspaceId: "ws_1",
      role: "member",
    });

    expect(overview).toEqual({
      role: "member",
      planName: "Standard",
      status: "active",
    });
  });

  it("shapes an admin view with plan name and slug only", async () => {
    mocks.getWorkspaceBilling.mockResolvedValue(billingState);

    const overview = await getBillingOverview({
      workspaceId: "ws_1",
      role: "admin",
    });

    expect(overview).toEqual({
      role: "admin",
      planName: "Standard",
      planSlug: "standard",
    });
  });

  it("shapes a full owner view with subscription and credit detail", async () => {
    mocks.getWorkspaceBilling.mockResolvedValue(billingState);

    const overview = await getBillingOverview({
      workspaceId: "ws_1",
      role: "owner",
    });

    expect(overview).toEqual({
      role: "owner",
      planName: "Standard",
      planSlug: "standard",
      subscription: {
        status: "active",
        currentPeriodEnd: billingState.subscription.currentPeriodEnd,
        cancelAtPeriodEnd: false,
        stripeCustomerId: "cus_123",
      },
      creditBalance: 4200,
      billingMode: "subscription",
    });
  });

  it("defaults to the free plan and null subscription when there is none", async () => {
    mocks.getWorkspaceBilling.mockResolvedValue({
      plan: null,
      subscription: null,
      creditBalance: { balance: 0 },
      billingMode: "subscription" as const,
    });

    const overview = await getBillingOverview({
      workspaceId: "ws_1",
      role: "owner",
    });

    expect(overview).toMatchObject({
      role: "owner",
      planName: "Free",
      planSlug: "free",
      subscription: null,
      creditBalance: 0,
    });
  });
});
