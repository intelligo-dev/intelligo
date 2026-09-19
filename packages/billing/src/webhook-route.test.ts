/**
 * Stripe webhook receiver.
 *
 * The properties that make a webhook endpoint safe to point Stripe at:
 * a bad signature is refused, a duplicate delivery does not re-run the
 * handlers, a delivery racing one in flight is deferred rather than
 * acknowledged, a handler failure is reported as a failure (so Stripe
 * retries) and releases the claim, and only a success is recorded as
 * processed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  handleCheckoutCompleted: vi.fn(),
  handleCheckoutAsyncPaymentSucceeded: vi.fn(),
  handleCheckoutAsyncPaymentFailed: vi.fn(),
  claimReturning: vi.fn(),
  selectRows: vi.fn(),
  insertValues: vi.fn(),
  updateSet: vi.fn(),
}));

vi.mock("./stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent } }),
}));
vi.mock("./webhook-handlers", () => ({
  handleCheckoutCompleted: mocks.handleCheckoutCompleted,
  handleCheckoutAsyncPaymentSucceeded:
    mocks.handleCheckoutAsyncPaymentSucceeded,
  handleCheckoutAsyncPaymentFailed: mocks.handleCheckoutAsyncPaymentFailed,
  handleInvoicePaid: vi.fn(),
  handleInvoicePaymentFailed: vi.fn(),
  handleSubscriptionUpdated: vi.fn(),
  handleSubscriptionDeleted: vi.fn(),
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
  financeEvents: {
    __name: "finance_events",
    stripeEventId: "stripe_event_id",
    processedAt: "processed_at",
    claimedAt: "claimed_at",
    id: "id",
  },
  organization: { __name: "organization", id: "organization.id" },
}));
vi.mock("@intelligo-dev/core/db", () => ({
  db: {
    select: () => ({
      from: (t: { __name: string }) => ({
        where: () => ({ limit: async () => mocks.selectRows(t.__name) }),
      }),
    }),
    insert: () => ({
      values: (v: unknown) => {
        mocks.insertValues(v);
        return { onConflictDoNothing: async () => {} };
      },
    }),
    update: () => ({
      set: (s: unknown) => {
        mocks.updateSet(s);
        return {
          where: () => ({
            returning: mocks.claimReturning,
            // releaseClaim awaits the where() itself
            then: (resolve: (v: unknown) => void) => resolve([]),
          }),
        };
      },
    }),
  },
}));

import { createStripeWebhookHandler } from "./webhook-route";

const event = {
  id: "evt_1",
  type: "checkout.session.completed",
  data: { object: { metadata: { workspaceId: "ws-1" }, amount_total: 500 } },
};

const request = (sig: string | null = "sig") =>
  new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body: "{}",
    headers: sig ? { "stripe-signature": sig } : {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.constructEvent.mockReturnValue(event);
  mocks.claimReturning.mockResolvedValue([{ id: "fe-1" }]);
  mocks.selectRows.mockImplementation((table: string) =>
    table === "organization" ? [{ id: "ws-1" }] : [{ processedAt: null }]
  );
  mocks.handleCheckoutCompleted.mockResolvedValue(undefined);
});

describe("createStripeWebhookHandler", () => {
  const handler = createStripeWebhookHandler({ secret: "whsec_test" });

  it("refuses a missing or invalid signature with 400", async () => {
    expect((await handler(request(null))).status).toBe(400);
    mocks.constructEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    expect((await handler(request("nope"))).status).toBe(400);
    expect(mocks.handleCheckoutCompleted).not.toHaveBeenCalled();
  });

  it("records the receipt before running the handler, and answers 200", async () => {
    const res = await handler(request());
    expect(res.status).toBe(200);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeEventId: "evt_1",
        workspaceId: "ws-1",
        amountMinor: 500,
        processedAt: null,
      })
    );
    expect(mocks.insertValues.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.handleCheckoutCompleted.mock.invocationCallOrder[0]!
    );
  });

  it("does not re-run the handlers for a delivery already processed", async () => {
    mocks.claimReturning.mockResolvedValue([]);
    mocks.selectRows.mockResolvedValue([{ processedAt: new Date() }]);
    const res = await handler(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(mocks.handleCheckoutCompleted).not.toHaveBeenCalled();
  });

  it("defers a delivery while another one holds the claim, so Stripe retries it", async () => {
    mocks.claimReturning.mockResolvedValue([]);
    mocks.selectRows.mockResolvedValue([{ processedAt: null }]);
    const res = await handler(request());
    expect(res.status).toBe(409);
    expect(mocks.handleCheckoutCompleted).not.toHaveBeenCalled();
  });

  it("marks the event processed only after the handlers succeed", async () => {
    await handler(request());
    const sets = mocks.updateSet.mock.calls.map(
      (c) => c[0] as Record<string, unknown>
    );
    expect(sets[0]!.claimedAt).toBeInstanceOf(Date);
    expect(sets[0]).not.toHaveProperty("processedAt");
    expect(sets[1]!.processedAt).toBeInstanceOf(Date);
    expect(mocks.updateSet.mock.invocationCallOrder[1]!).toBeGreaterThan(
      mocks.handleCheckoutCompleted.mock.invocationCallOrder[0]!
    );
  });

  it("records a deleted workspace's event without the workspace", async () => {
    mocks.selectRows.mockImplementation((table: string) =>
      table === "organization" ? [] : [{ processedAt: null }]
    );
    expect((await handler(request())).status).toBe(200);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: null })
    );
  });

  it("answers 500 and releases the claim when a handler throws, so Stripe retries", async () => {
    mocks.handleCheckoutCompleted.mockRejectedValue(new Error("db down"));
    const res = await handler(request());
    expect(res.status).toBe(500);
    const sets = mocks.updateSet.mock.calls.map(
      (c) => c[0] as Record<string, unknown>
    );
    expect(sets[0]!.claimedAt).toBeInstanceOf(Date);
    expect(sets[1]).toEqual({ claimedAt: null });
    expect(sets.some((set) => set.processedAt)).toBe(false);
  });

  it("dispatches the two delayed-payment outcomes to their handlers", async () => {
    mocks.constructEvent.mockReturnValue({
      ...event,
      id: "evt_2",
      type: "checkout.session.async_payment_succeeded",
    });
    expect((await handler(request())).status).toBe(200);
    expect(mocks.handleCheckoutAsyncPaymentSucceeded).toHaveBeenCalledWith(
      event.data.object
    );

    mocks.constructEvent.mockReturnValue({
      ...event,
      id: "evt_3",
      type: "checkout.session.async_payment_failed",
    });
    expect((await handler(request())).status).toBe(200);
    expect(mocks.handleCheckoutAsyncPaymentFailed).toHaveBeenCalledWith(
      event.data.object
    );
    expect(mocks.handleCheckoutCompleted).not.toHaveBeenCalled();
  });

  it("refuses to serve without a webhook secret", async () => {
    const unconfigured = createStripeWebhookHandler({ secret: "" });
    expect((await unconfigured(request())).status).toBe(500);
  });
});
