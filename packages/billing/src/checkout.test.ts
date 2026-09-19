/**
 * checkout.ts tests. Stripe and db are mocked: a hoisted mock bag,
 * `vi.mock` for each external module, chained select/from/where/limit
 * builders returning canned rows.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  checkoutSessionsCreate: vi.fn(),
  checkoutSessionsRetrieve: vi.fn(),
  billingPortalSessionsCreate: vi.fn(),
  subscriptionsRetrieve: vi.fn(),
  subscriptionsCancel: vi.fn(),
  subscriptionsList: vi.fn(),
  checkoutSessionsList: vi.fn(),
  checkoutSessionsExpire: vi.fn(),
  getStripe: vi.fn(),
  getWorkspaceSubscription: vi.fn(),

  getPlanBySlug: vi.fn(),

  getOrCreateStripeCustomer: vi.fn(),
  getWorkspaceBilling: vi.fn(),

  getBillingSettings: vi.fn(),

  selectLimit: vi.fn(),
  selectWhere: vi.fn(),
  selectFrom: vi.fn(),
  select: vi.fn(),
  insertValues: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("./stripe", async () => ({
  getStripe: mocks.getStripe,
  toStripeLocale: (await vi.importActual<typeof import("./stripe")>("./stripe"))
    .toStripeLocale,
}));

vi.mock("./plans", () => ({
  getPlanBySlug: mocks.getPlanBySlug,
}));

vi.mock("./queries", () => ({
  getOrCreateStripeCustomer: mocks.getOrCreateStripeCustomer,
  getWorkspaceBilling: mocks.getWorkspaceBilling,
  getWorkspaceSubscription: mocks.getWorkspaceSubscription,
}));

vi.mock("./billing-settings", () => ({
  getBillingSettings: mocks.getBillingSettings,
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
  cancelWorkspaceSubscription,
  getCheckoutSession,
  isBillingServiceError,
} from "./checkout";
import { getBillingOverview } from "./billing-overview";

beforeEach(() => {
  vi.resetAllMocks();

  mocks.selectWhere.mockReturnValue({ limit: mocks.selectLimit });
  mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
  mocks.select.mockReturnValue({ from: mocks.selectFrom });
  mocks.selectLimit.mockResolvedValue([
    { email: "a@example.com", name: "Alice", preferredLanguage: "en" },
  ]);
  // A tugrik deployment, which is what the legacy bundle shape assumed.
  mocks.getBillingSettings.mockResolvedValue({
    currency: "MNT",
    usdRateMicros: 3_450_000_000,
    marginBp: 40_000,
  });

  mocks.insertValues.mockResolvedValue(undefined);
  mocks.insert.mockReturnValue({ values: mocks.insertValues });

  mocks.getStripe.mockReturnValue({
    checkout: {
      sessions: {
        create: mocks.checkoutSessionsCreate,
        retrieve: mocks.checkoutSessionsRetrieve,
        list: mocks.checkoutSessionsList,
        expire: mocks.checkoutSessionsExpire,
      },
    },
    billingPortal: {
      sessions: { create: mocks.billingPortalSessionsCreate },
    },
    subscriptions: {
      retrieve: mocks.subscriptionsRetrieve,
      cancel: mocks.subscriptionsCancel,
      list: mocks.subscriptionsList,
    },
  });
  mocks.subscriptionsList.mockResolvedValue({ data: [] });
  mocks.checkoutSessionsList.mockResolvedValue({ data: [] });

  mocks.getOrCreateStripeCustomer.mockResolvedValue("cus_123");
  // A workspace on the free row: no Stripe subscription yet.
  mocks.getWorkspaceSubscription.mockResolvedValue({
    subscription: { status: "active", stripeSubscriptionId: null },
    plan: { slug: "free" },
  });
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
      productSlug: "acme",
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
      productSlug: "acme",
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
      productSlug: "acme",
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
      productSlug: "acme",
      successUrl: "https://app.example.com/checkout/success",
      cancelUrl: "https://app.example.com/pricing",
    });

    await expect(call).rejects.toMatchObject({
      code: "checkout_unavailable",
    });
    expect(isBillingServiceError(await call.catch((e) => e))).toBe(true);
    expect(mocks.checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  const upgrade = {
    workspaceId: "ws_1",
    userId: "user_1",
    planSlug: "standard",
    interval: "monthly" as const,
    productSlug: "acme",
    successUrl:
      "https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://app.example.com/pricing?canceled=true",
  };

  it("sends a workspace that already subscribes to the portal's confirm-update flow instead of a second checkout", async () => {
    mocks.getPlanBySlug.mockReturnValue(basePlan);
    mocks.getWorkspaceSubscription.mockResolvedValue({
      subscription: { status: "active", stripeSubscriptionId: "sub_1" },
      plan: { slug: "pro" },
    });
    mocks.subscriptionsRetrieve.mockResolvedValue({
      id: "sub_1",
      items: { data: [{ id: "si_1", price: { id: "price_pro_monthly" } }] },
    });
    mocks.billingPortalSessionsCreate.mockResolvedValue({
      url: "https://billing.stripe.com/p/session_xyz",
    });

    const result = await createSubscriptionCheckout(upgrade);

    expect(result).toEqual({ url: "https://billing.stripe.com/p/session_xyz" });
    expect(mocks.checkoutSessionsCreate).not.toHaveBeenCalled();
    expect(mocks.billingPortalSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_123",
        return_url: "https://app.example.com/pricing",
        flow_data: {
          type: "subscription_update_confirm",
          subscription_update_confirm: {
            subscription: "sub_1",
            items: [{ id: "si_1", price: "price_monthly_123", quantity: 1 }],
          },
          after_completion: {
            type: "redirect",
            redirect: { return_url: "https://app.example.com/pricing" },
          },
        },
      })
    );
  });

  it("opens the portal's home, with no plan change, while a payment is outstanding", async () => {
    mocks.getPlanBySlug.mockReturnValue(basePlan);
    mocks.getWorkspaceSubscription.mockResolvedValue({
      subscription: { status: "past_due", stripeSubscriptionId: "sub_1" },
      plan: { slug: "pro" },
    });
    mocks.billingPortalSessionsCreate.mockResolvedValue({
      url: "https://billing.stripe.com/p/session_due",
    });

    const result = await createSubscriptionCheckout({
      ...upgrade,
      returnUrl: "https://app.example.com/settings/billing",
    });

    expect(result).toEqual({ url: "https://billing.stripe.com/p/session_due" });
    expect(mocks.checkoutSessionsCreate).not.toHaveBeenCalled();
    expect(mocks.subscriptionsRetrieve).not.toHaveBeenCalled();
    const params = mocks.billingPortalSessionsCreate.mock.calls[0]![0];
    expect(params.return_url).toBe("https://app.example.com/settings/billing");
    expect(params).not.toHaveProperty("flow_data");
  });

  it("opens the portal's home when the subscription is already on the requested price", async () => {
    mocks.getPlanBySlug.mockReturnValue(basePlan);
    mocks.getWorkspaceSubscription.mockResolvedValue({
      subscription: { status: "trialing", stripeSubscriptionId: "sub_1" },
      plan: { slug: "standard" },
    });
    mocks.subscriptionsRetrieve.mockResolvedValue({
      id: "sub_1",
      items: { data: [{ id: "si_1", price: { id: "price_monthly_123" } }] },
    });
    mocks.billingPortalSessionsCreate.mockResolvedValue({
      url: "https://billing.stripe.com/p/session_same",
    });

    await createSubscriptionCheckout(upgrade);

    expect(
      mocks.billingPortalSessionsCreate.mock.calls[0]![0]
    ).not.toHaveProperty("flow_data");
  });

  it("sends to the portal a subscription Stripe holds before its webhook landed", async () => {
    mocks.getPlanBySlug.mockReturnValue(basePlan);
    mocks.subscriptionsList.mockResolvedValue({
      data: [{ id: "sub_paid", status: "active" }],
    });
    mocks.subscriptionsRetrieve.mockResolvedValue({
      id: "sub_paid",
      items: { data: [{ id: "si_1", price: { id: "price_monthly_123" } }] },
    });
    mocks.billingPortalSessionsCreate.mockResolvedValue({
      url: "https://billing.stripe.com/p/session_live",
    });

    const result = await createSubscriptionCheckout(upgrade);

    expect(result.url).toBe("https://billing.stripe.com/p/session_live");
    expect(mocks.checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("expires an open subscription checkout before opening another", async () => {
    mocks.getPlanBySlug.mockReturnValue(basePlan);
    mocks.checkoutSessionsList.mockResolvedValue({
      data: [
        { id: "cs_tab1", mode: "subscription" },
        { id: "cs_credits", mode: "payment" },
      ],
    });
    mocks.checkoutSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_tab2",
    });

    await createSubscriptionCheckout(upgrade);

    expect(mocks.checkoutSessionsExpire).toHaveBeenCalledTimes(1);
    expect(mocks.checkoutSessionsExpire).toHaveBeenCalledWith("cs_tab1");
    expect(
      mocks.checkoutSessionsExpire.mock.invocationCallOrder[0]!
    ).toBeLessThan(mocks.checkoutSessionsCreate.mock.invocationCallOrder[0]!);
  });

  it.each(["canceled", "incomplete", "incomplete_expired"])(
    "opens a new checkout when the previous subscription is %s",
    async (status) => {
      mocks.getPlanBySlug.mockReturnValue(basePlan);
      mocks.getWorkspaceSubscription.mockResolvedValue({
        subscription: { status, stripeSubscriptionId: "sub_old" },
        plan: { slug: "pro" },
      });
      mocks.checkoutSessionsCreate.mockResolvedValue({
        url: "https://checkout.stripe.com/session_new",
      });

      const result = await createSubscriptionCheckout(upgrade);

      expect(result).toEqual({
        url: "https://checkout.stripe.com/session_new",
      });
      expect(mocks.billingPortalSessionsCreate).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["de", "de"],
    ["pt-BR", "pt-BR"],
    ["de-AT", "de"],
    ["mn", "auto"],
    ["xx-YY", "auto"],
  ])(
    "maps the app locale %s to the Stripe checkout locale %s",
    async (locale, expected) => {
      mocks.getPlanBySlug.mockReturnValue(basePlan);
      mocks.checkoutSessionsCreate.mockResolvedValue({
        url: "https://checkout.stripe.com/session_abc",
      });

      await createSubscriptionCheckout({ ...upgrade, locale });

      expect(mocks.checkoutSessionsCreate.mock.calls[0]![0].locale).toBe(
        expected
      );
    }
  );
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
        // What the buyer pays and what the workspace receives, each
        // naming its own currency.
        priceMinor: 101, // Math.round(1.01 * 100)
        priceCurrency: "USD",
        grantedMicros: 100_000_000_000,
        grantedCurrency: "MNT",
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

  it("records what was paid and what was granted, separately", async () => {
    mocks.checkoutSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_typed",
    });

    await createCreditCheckout({
      workspaceId: "ws_1",
      userId: "user_1",
      bundle: {
        id: "pack-5",
        name: "Credit pack",
        // ₮100,000 of credit, sold for $5: two amounts, two currencies.
        grant: { amount: 100_000_000_000, currency: "MNT" },
        price: { amount: 5_000_000, currency: "USD" },
      },
      successUrl: "https://app.example.com/settings/billing?credits=success",
      cancelUrl: "https://app.example.com/settings/billing?credits=cancelled",
    });

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        grantedMicros: 100_000_000_000,
        grantedCurrency: "MNT",
        priceMinor: 500,
        priceCurrency: "USD",
      })
    );
    // The buyer is charged in the price's own currency, not a hardcoded one.
    expect(mocks.checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              currency: "usd",
              unit_amount: 500,
            }),
          }),
        ],
      })
    );
  });

  it("refuses a grant in a currency the ledger is not denominated in", async () => {
    const call = createCreditCheckout({
      workspaceId: "ws_1",
      userId: "user_1",
      bundle: {
        id: "pack-usd",
        name: "Credit pack",
        grant: { amount: 5_000_000, currency: "USD" },
        price: { amount: 5_000_000, currency: "USD" },
      },
      successUrl: "https://app.example.com/settings/billing",
      cancelUrl: "https://app.example.com/settings/billing",
    });

    await expect(call).rejects.toMatchObject({ code: "invalid_bundle" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("cancelWorkspaceSubscription", () => {
  it("cancels a live Stripe subscription", async () => {
    mocks.getWorkspaceBilling.mockResolvedValue({
      subscription: { status: "active", stripeSubscriptionId: "sub_1" },
    });
    await cancelWorkspaceSubscription("ws_1");
    expect(mocks.subscriptionsCancel).toHaveBeenCalledWith("sub_1");
  });

  it("leaves a workspace without one, or already canceled, alone", async () => {
    mocks.getWorkspaceBilling.mockResolvedValue({ subscription: null });
    await cancelWorkspaceSubscription("ws_1");
    mocks.getWorkspaceBilling.mockResolvedValue({
      subscription: { status: "canceled", stripeSubscriptionId: "sub_1" },
    });
    await cancelWorkspaceSubscription("ws_1");
    expect(mocks.subscriptionsCancel).not.toHaveBeenCalled();
  });

  it("treats a subscription Stripe no longer has as ended", async () => {
    mocks.getWorkspaceBilling.mockResolvedValue({
      subscription: { status: "active", stripeSubscriptionId: "sub_gone" },
    });
    mocks.subscriptionsCancel.mockRejectedValue({ code: "resource_missing" });
    await expect(cancelWorkspaceSubscription("ws_1")).resolves.toBeUndefined();
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
      metadata: { workspaceId: "ws_1" },
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

    const summary = await getCheckoutSession({
      sessionId: "cs_123",
      workspaceId: "ws_1",
    });

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

    const call = getCheckoutSession({
      sessionId: "cs_missing",
      workspaceId: "ws_1",
    });

    await expect(call).rejects.toMatchObject({ code: "session_not_found" });
  });

  it.each([
    ["another workspace's", { workspaceId: "ws_other" }],
    ["an unattributed", undefined],
  ])("reads %s session as session_not_found", async (_label, metadata) => {
    mocks.checkoutSessionsRetrieve.mockResolvedValue({
      status: "complete",
      customer_email: "someone@example.com",
      metadata,
      subscription: null,
    });

    const call = getCheckoutSession({
      sessionId: "cs_123",
      workspaceId: "ws_1",
    });

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
    creditBalance: { balanceMicros: 4_200_000_000, currency: "MNT" },
    billingMode: "subscription" as const,
  };

  it("shapes a member view with the plan and status only", async () => {
    mocks.getWorkspaceBilling.mockResolvedValue(billingState);

    const overview = await getBillingOverview({
      workspaceId: "ws_1",
      role: "member",
    });

    expect(overview).toEqual({
      role: "member",
      planName: "Standard",
      planSlug: "standard",
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
      // An amount that names its own currency.
      creditBalance: { amount: 4_200_000_000, currency: "MNT" },
      billingMode: "subscription",
    });
  });

  it("defaults to the free plan and null subscription when there is none", async () => {
    mocks.getWorkspaceBilling.mockResolvedValue({
      plan: null,
      subscription: null,
      creditBalance: { balanceMicros: 0, currency: "MNT" },
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
      creditBalance: { amount: 0, currency: "MNT" },
    });
  });
});
