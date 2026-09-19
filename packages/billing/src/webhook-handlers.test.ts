/**
 * webhook-handlers.ts tests. Stripe, the logger and the neighbouring
 * billing modules are mocked; the db is a small fake that keeps one
 * credit purchase and one balance in memory and applies the two
 * conditional updates the handlers rely on, so a double delivery can be
 * asserted on the resulting balance rather than on call counts.
 */

import type Stripe from "stripe";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  subscriptionsRetrieve: vi.fn(),
  getBillingSettings: vi.fn(),
  resetMonthlyQuota: vi.fn(),
  convertTrialToPaid: vi.fn(),
  invalidateFeatureCache: vi.fn(),
  getSubscriptionByStripeId: vi.fn(),
  sendSubscriptionConfirmation: vi.fn(),
  sendPaymentFailedEmail: vi.fn(),
  state: {
    purchase: null as null | Record<string, unknown>,
    balanceMicros: 0,
    ledgerCurrency: "USD",
    subscriptionSets: [] as Record<string, unknown>[],
    subscriptionUpserts: [] as Record<string, unknown>[],
  },
}));

vi.mock("./stripe", () => ({
  getStripe: () => ({
    subscriptions: { retrieve: mocks.subscriptionsRetrieve },
  }),
}));
vi.mock("./billing-settings", () => ({
  getBillingSettings: mocks.getBillingSettings,
}));
vi.mock("./quota", () => ({ resetMonthlyQuota: mocks.resetMonthlyQuota }));
vi.mock("./trial", () => ({ convertTrialToPaid: mocks.convertTrialToPaid }));
vi.mock("./features", () => ({
  invalidateFeatureCache: mocks.invalidateFeatureCache,
}));
vi.mock("./webhook-helpers", () => ({
  getSubscriptionByStripeId: mocks.getSubscriptionByStripeId,
  sendSubscriptionConfirmation: mocks.sendSubscriptionConfirmation,
  sendPaymentFailedEmail: mocks.sendPaymentFailedEmail,
}));
vi.mock("@intelligo-dev/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@intelligo-dev/core/db/schema", () => ({
  subscriptions: { table: "subscriptions", workspaceId: "workspace_id" },
  creditPurchases: { table: "credit_purchases", id: "id", status: "status" },
  creditBalances: { table: "credit_balances", id: "id", currency: "currency" },
  plans: { table: "plans" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
  ne: vi.fn((col: unknown, val: unknown) => ({ op: "ne", col, val })),
  and: vi.fn((...conds: unknown[]) => ({ op: "and", conds })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  })),
}));

vi.mock("@intelligo-dev/core/db", () => {
  const { state } = mocks;
  type Table = { table: string };

  const result = <T>(rows: T[]) => ({
    returning: async () => rows,
    then: (resolve: (v: T[]) => void) => resolve(rows),
  });

  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (state.purchase ? [{ ...state.purchase }] : []),
        }),
      }),
    }),
    update: (table: Table) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          if (table.table === "subscriptions") {
            state.subscriptionSets.push(values);
            return result([{ workspaceId: "ws-1" }]);
          }
          const purchase = state.purchase;
          if (!purchase) return result([]);
          const applies =
            values.status === "completed"
              ? purchase.status !== "completed"
              : purchase.status === "pending";
          if (!applies) return result([]);
          Object.assign(purchase, values);
          return result([{ id: purchase.id }]);
        },
      }),
    }),
    insert: (table: Table) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: () => {
          if (table.table === "subscriptions") {
            state.subscriptionUpserts.push(values);
            return result([{ id: "sub-row" }]);
          }
          if (values.currency !== state.ledgerCurrency) return result([]);
          state.balanceMicros += values.balanceMicros as number;
          return result([{ id: "balance-row" }]);
        },
      }),
    }),
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const before = state.purchase ? { ...state.purchase } : null;
      const balance = state.balanceMicros;
      try {
        return await fn(db);
      } catch (error) {
        state.purchase = before;
        state.balanceMicros = balance;
        throw error;
      }
    },
  };
  return { db };
});

import {
  handleCheckoutAsyncPaymentFailed,
  handleCheckoutAsyncPaymentSucceeded,
  handleCheckoutCompleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
  invoiceSubscriptionId,
  planIdForPrice,
  subscriptionPeriod,
} from "./webhook-handlers";
import { clearProductPlans, registerProductPlans } from "./plan-registry";
import type { PlanConfig } from "./plans";

const plan = (slug: string, monthly: string, yearly: string) =>
  ({
    slug,
    name: slug,
    stripePriceIdMonthly: monthly,
    stripePriceIdYearly: yearly,
  }) as PlanConfig;

const START = 1_760_000_000;
const END = 1_762_678_400;

const subscription = (over: Record<string, unknown> = {}) =>
  ({
    id: "sub_1",
    status: "active",
    cancel_at_period_end: false,
    metadata: { workspaceId: "ws-1", planId: "plan_standard" },
    items: {
      data: [
        {
          id: "si_1",
          price: { id: "price_std_m", metadata: {} },
          current_period_start: START,
          current_period_end: END,
        },
      ],
    },
    ...over,
  }) as unknown as Stripe.Subscription;

const paymentSession = (paymentStatus: string) =>
  ({
    id: "cs_1",
    mode: "payment",
    payment_status: paymentStatus,
    metadata: { workspaceId: "ws-1", purchaseId: "purchase-1" },
  }) as unknown as Stripe.Checkout.Session;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.purchase = {
    id: "purchase-1",
    workspaceId: "ws-1",
    status: "pending",
    stripeCheckoutSessionId: "pending",
    grantedMicros: 5_000_000,
    grantedCurrency: "USD",
  };
  mocks.state.balanceMicros = 0;
  mocks.state.ledgerCurrency = "USD";
  mocks.state.subscriptionSets = [];
  mocks.state.subscriptionUpserts = [];
  mocks.getBillingSettings.mockResolvedValue({ currency: "USD" });
  mocks.getSubscriptionByStripeId.mockResolvedValue({
    workspaceId: "ws-1",
    planId: "plan_standard",
  });

  clearProductPlans();
  registerProductPlans("acme", {
    standard: plan("standard", "price_std_m", "price_std_y"),
    pro: plan("pro", "price_pro_m", "price_pro_y"),
  });
});

describe("subscriptionPeriod", () => {
  it("reads the bounds from the first item", () => {
    expect(subscriptionPeriod(subscription())).toEqual({
      start: START,
      end: END,
    });
  });

  it("reads them from the subscription when the items carry none", () => {
    const legacy = subscription({
      current_period_start: START,
      current_period_end: END,
      items: { data: [{ id: "si_1", price: { id: "price_std_m" } }] },
    });
    expect(subscriptionPeriod(legacy)).toEqual({ start: START, end: END });
  });

  it("answers null rather than an invalid date when neither shape is present", () => {
    expect(
      subscriptionPeriod(subscription({ items: { data: [] } }))
    ).toBeNull();
  });
});

describe("invoiceSubscriptionId", () => {
  it("reads parent.subscription_details, as a string or an expanded object", () => {
    const invoice = (sub: unknown) =>
      ({
        parent: { subscription_details: { subscription: sub } },
      }) as unknown as Stripe.Invoice;
    expect(invoiceSubscriptionId(invoice("sub_1"))).toBe("sub_1");
    expect(invoiceSubscriptionId(invoice({ id: "sub_2" }))).toBe("sub_2");
  });

  it("reads the top-level subscription of older API versions", () => {
    expect(
      invoiceSubscriptionId({
        subscription: "sub_1",
      } as unknown as Stripe.Invoice)
    ).toBe("sub_1");
  });

  it("answers null for an invoice no subscription produced", () => {
    expect(invoiceSubscriptionId({} as Stripe.Invoice)).toBeNull();
  });
});

describe("planIdForPrice", () => {
  it("finds the registered plan by either interval's price", () => {
    expect(planIdForPrice("price_pro_m")).toBe("plan_pro");
    expect(planIdForPrice("price_std_y")).toBe("plan_standard");
  });

  it("answers null for a price no plan sells under", () => {
    expect(planIdForPrice("price_unknown")).toBeNull();
    expect(planIdForPrice(undefined)).toBeNull();
  });
});

describe("handleSubscriptionUpdated", () => {
  it("takes the plan from the price, over stale planId metadata", async () => {
    await handleSubscriptionUpdated(
      subscription({
        items: {
          data: [
            {
              id: "si_1",
              price: { id: "price_pro_y", metadata: {} },
              current_period_start: START,
              current_period_end: END,
            },
          ],
        },
      })
    );

    expect(mocks.state.subscriptionSets[0]).toMatchObject({
      planId: "plan_pro",
      status: "active",
      currentPeriodStart: new Date(START * 1000),
      currentPeriodEnd: new Date(END * 1000),
    });
    expect(mocks.invalidateFeatureCache).toHaveBeenCalledWith("ws-1");
  });

  it("falls back to metadata for a price outside the catalogue", async () => {
    await handleSubscriptionUpdated(
      subscription({
        items: { data: [{ id: "si_1", price: { id: "price_legacy" } }] },
        current_period_start: START,
        current_period_end: END,
      })
    );

    expect(mocks.state.subscriptionSets[0]).toMatchObject({
      planId: "plan_standard",
      currentPeriodEnd: new Date(END * 1000),
    });
  });

  it("still records the status, and keeps the stored plan and period, when neither can be resolved", async () => {
    await handleSubscriptionUpdated(
      subscription({
        status: "unpaid",
        metadata: {},
        items: { data: [{ id: "si_1", price: { id: "price_legacy" } }] },
      })
    );

    const set = mocks.state.subscriptionSets[0]!;
    expect(set.status).toBe("unpaid");
    expect(set).not.toHaveProperty("planId");
    expect(set).not.toHaveProperty("currentPeriodStart");
    expect(mocks.invalidateFeatureCache).toHaveBeenCalledWith("ws-1");
  });
});

describe("status-changing events drop the workspace's feature cache", () => {
  const invoice = {
    parent: { subscription_details: { subscription: "sub_1" } },
    lines: { data: [{ period: { start: START, end: END } }] },
  } as unknown as Stripe.Invoice;

  it("customer.subscription.deleted", async () => {
    await handleSubscriptionDeleted(subscription());
    expect(mocks.state.subscriptionSets[0]).toMatchObject({
      status: "canceled",
    });
    expect(mocks.invalidateFeatureCache).toHaveBeenCalledWith("ws-1");
  });

  it("invoice.paid", async () => {
    await handleInvoicePaid(invoice);
    expect(mocks.state.subscriptionSets[0]).toMatchObject({ status: "active" });
    expect(mocks.invalidateFeatureCache).toHaveBeenCalledWith("ws-1");
    expect(mocks.resetMonthlyQuota).toHaveBeenCalledWith("ws-1");
  });

  it("invoice.payment_failed", async () => {
    await handleInvoicePaymentFailed(invoice);
    expect(mocks.state.subscriptionSets[0]).toMatchObject({
      status: "past_due",
    });
    expect(mocks.invalidateFeatureCache).toHaveBeenCalledWith("ws-1");
  });
});

describe("handleCheckoutCompleted — subscription", () => {
  const session = {
    id: "cs_sub",
    mode: "subscription",
    customer: "cus_1",
    subscription: "sub_1",
    metadata: { workspaceId: "ws-1", planId: "plan_standard" },
  } as unknown as Stripe.Checkout.Session;

  it("stores the plan of the price that was bought and the period from either shape", async () => {
    mocks.subscriptionsRetrieve.mockResolvedValue(
      subscription({
        current_period_start: START,
        current_period_end: END,
        items: { data: [{ id: "si_1", price: { id: "price_pro_m" } }] },
      })
    );

    await handleCheckoutCompleted(session);

    expect(mocks.state.subscriptionUpserts[0]).toMatchObject({
      workspaceId: "ws-1",
      planId: "plan_pro",
      stripeSubscriptionId: "sub_1",
      currentPeriodStart: new Date(START * 1000),
      currentPeriodEnd: new Date(END * 1000),
    });
    expect(mocks.convertTrialToPaid).toHaveBeenCalledWith("ws-1");
    expect(mocks.invalidateFeatureCache).toHaveBeenCalledWith("ws-1");
  });
});

describe("credit purchases across completed and async_payment_*", () => {
  it("grants nothing on an unpaid completed, then once on async_payment_succeeded", async () => {
    await handleCheckoutCompleted(paymentSession("unpaid"));
    expect(mocks.state.balanceMicros).toBe(0);
    expect(mocks.state.purchase!.status).toBe("pending");

    await handleCheckoutAsyncPaymentSucceeded(paymentSession("paid"));
    expect(mocks.state.balanceMicros).toBe(5_000_000);
    expect(mocks.state.purchase).toMatchObject({
      status: "completed",
      stripeCheckoutSessionId: "cs_1",
    });
  });

  it("never grants twice, whichever events repeat or overlap", async () => {
    await handleCheckoutCompleted(paymentSession("paid"));
    await handleCheckoutAsyncPaymentSucceeded(paymentSession("paid"));
    await handleCheckoutCompleted(paymentSession("paid"));
    expect(mocks.state.balanceMicros).toBe(5_000_000);
  });

  it("grants once when both events pass the completed check before either claims", async () => {
    await Promise.all([
      handleCheckoutCompleted(paymentSession("paid")),
      handleCheckoutAsyncPaymentSucceeded(paymentSession("paid")),
    ]);
    expect(mocks.state.balanceMicros).toBe(5_000_000);
  });

  it("marks a pending purchase failed on async_payment_failed", async () => {
    await handleCheckoutAsyncPaymentFailed(paymentSession("unpaid"));
    expect(mocks.state.purchase!.status).toBe("failed");
    expect(mocks.state.balanceMicros).toBe(0);
  });

  it("leaves a granted purchase alone when a failure arrives afterwards", async () => {
    await handleCheckoutCompleted(paymentSession("paid"));
    await handleCheckoutAsyncPaymentFailed(paymentSession("unpaid"));
    expect(mocks.state.purchase!.status).toBe("completed");
    expect(mocks.state.balanceMicros).toBe(5_000_000);
  });

  it("keeps the purchase pending when the workspace ledger is in another currency", async () => {
    mocks.state.ledgerCurrency = "EUR";
    await handleCheckoutCompleted(paymentSession("paid"));
    expect(mocks.state.purchase!.status).toBe("pending");
    expect(mocks.state.balanceMicros).toBe(0);
  });
});
