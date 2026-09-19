/**
 * queries.ts tests: which subscription statuses keep a plan in force,
 * and what a new Stripe customer is told about the user's language. The
 * db is a fake keyed by table; Stripe is mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  customersCreate: vi.fn(),
  customersDel: vi.fn(),
  /** Rows the conditional customer-id write matched. */
  stored: [{ id: "sub-row" }] as unknown[],
  rows: {
    subscriptions: [] as unknown[],
    plans: [] as unknown[],
    credit_balances: [] as unknown[],
  },
}));

vi.mock("./stripe", () => ({
  getStripe: () => ({
    customers: { create: mocks.customersCreate, del: mocks.customersDel },
  }),
}));

vi.mock("@intelligo-dev/core/db/schema", () => ({
  plans: { table: "plans", id: "id", slug: "slug" },
  subscriptions: {
    table: "subscriptions",
    id: "id",
    stripeCustomerId: "stripe_customer_id",
  },
  creditBalances: { table: "credit_balances" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
  isNull: vi.fn((col: unknown) => ({ op: "isNull", col })),
}));

vi.mock("@intelligo-dev/core/db", () => ({
  db: {
    select: () => ({
      from: (table: { table: keyof typeof mocks.rows }) => {
        const rows = async () => mocks.rows[table.table];
        return {
          where: () => ({ limit: rows }),
          leftJoin: () => ({ where: () => ({ limit: rows }) }),
        };
      },
    }),
    update: () => ({
      set: () => ({
        where: () => ({ returning: async () => mocks.stored }),
      }),
    }),
  },
}));

import {
  getOrCreateStripeCustomer,
  getWorkspaceBilling,
  subscriptionEntitles,
} from "./queries";

const freePlan = { id: "plan_free", slug: "free", name: "Free" };
const proPlan = { id: "plan_pro", slug: "pro", name: "Pro" };

const subscribed = (status: string, stripeCustomerId: string | null = null) => [
  {
    subscriptions: {
      id: "sub-row",
      status,
      billingMode: "subscription",
      stripeCustomerId,
    },
    plans: proPlan,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows.subscriptions = [];
  mocks.rows.plans = [freePlan];
  mocks.rows.credit_balances = [];
  mocks.customersCreate.mockResolvedValue({ id: "cus_new" });
});

describe("subscriptionEntitles", () => {
  it.each(["active", "trialing", "past_due"])("%s entitles", (status) => {
    expect(subscriptionEntitles(status)).toBe(true);
  });

  it.each([
    "canceled",
    "unpaid",
    "incomplete",
    "incomplete_expired",
    "paused",
    "a_status_stripe_adds_later",
  ])("%s does not", (status) => {
    expect(subscriptionEntitles(status)).toBe(false);
  });
});

describe("getWorkspaceBilling", () => {
  it("returns the subscription's plan while the status entitles", async () => {
    mocks.rows.subscriptions = subscribed("past_due");
    const billing = await getWorkspaceBilling("ws-1");
    expect(billing.plan).toEqual(proPlan);
  });

  it("returns the free plan, and still the stored subscription, once it does not", async () => {
    mocks.rows.subscriptions = subscribed("canceled", "cus_1");
    const billing = await getWorkspaceBilling("ws-1");
    expect(billing.plan).toEqual(freePlan);
    expect(billing.subscription).toMatchObject({
      status: "canceled",
      stripeCustomerId: "cus_1",
    });
  });

  it("returns the free plan for a workspace with no subscription row", async () => {
    const billing = await getWorkspaceBilling("ws-1");
    expect(billing.subscription).toBeNull();
    expect(billing.plan).toEqual(freePlan);
  });
});

describe("getOrCreateStripeCustomer", () => {
  beforeEach(() => {
    mocks.rows.subscriptions = subscribed("active");
    mocks.stored = [{ id: "sub-row" }];
    mocks.customersCreate.mockResolvedValue({ id: "cus_new" });
    mocks.customersDel.mockResolvedValue({});
  });

  it.each(["mn", "de", "pt-BR"])(
    "passes the language %s through as the customer's preferred locale",
    async (language) => {
      await getOrCreateStripeCustomer("ws-1", "a@example.com", "A", language);
      expect(mocks.customersCreate).toHaveBeenCalledWith(
        expect.objectContaining({ preferred_locales: [language] })
      );
    }
  );

  it.each([undefined, "", "not a locale"])(
    "sends no preferred locale for %j",
    async (language) => {
      await getOrCreateStripeCustomer("ws-1", "a@example.com", "A", language);
      expect(mocks.customersCreate.mock.calls[0]![0]).not.toHaveProperty(
        "preferred_locales"
      );
    }
  );

  it("reuses the stored customer", async () => {
    mocks.rows.subscriptions = subscribed("active", "cus_existing");
    expect(await getOrCreateStripeCustomer("ws-1", "a@example.com", "A")).toBe(
      "cus_existing"
    );
    expect(mocks.customersCreate).not.toHaveBeenCalled();
  });

  it("keeps the customer a concurrent call stored first, and removes its own", async () => {
    mocks.stored = [];
    const reads = [subscribed("active"), subscribed("active", "cus_first")];
    Object.defineProperty(mocks.rows, "subscriptions", {
      get: () => reads.shift() ?? subscribed("active", "cus_first"),
      set: () => {},
      configurable: true,
    });

    expect(await getOrCreateStripeCustomer("ws-1", "a@example.com", "A")).toBe(
      "cus_first"
    );
    expect(mocks.customersDel).toHaveBeenCalledWith("cus_new");
  });
});
