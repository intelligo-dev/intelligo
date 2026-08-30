/**
 * Stripe webhook receiver.
 *
 * The properties that make a webhook endpoint safe to point Stripe at:
 * a bad signature is refused, a duplicate delivery does not re-run the
 * handlers, a handler failure is reported as a failure (so Stripe
 * retries) and releases the claim, and a success is recorded.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  handleCheckoutCompleted: vi.fn(),
  claimReturning: vi.fn(),
  insertValues: vi.fn(),
  updateSet: vi.fn(),
}));

vi.mock("./stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent } }),
}));
vi.mock("./webhook-handlers", () => ({
  handleCheckoutCompleted: mocks.handleCheckoutCompleted,
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
    stripeEventId: "stripe_event_id",
    processedAt: "processed_at",
    id: "id",
  },
}));
vi.mock("@intelligo-dev/core/db", () => ({
  db: {
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
        amount: 500,
        processedAt: null,
      })
    );
    expect(mocks.insertValues.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.handleCheckoutCompleted.mock.invocationCallOrder[0]!
    );
  });

  it("does not re-run the handlers for a delivery already claimed", async () => {
    mocks.claimReturning.mockResolvedValue([]);
    const res = await handler(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(mocks.handleCheckoutCompleted).not.toHaveBeenCalled();
  });

  it("answers 500 and releases the claim when a handler throws, so Stripe retries", async () => {
    mocks.handleCheckoutCompleted.mockRejectedValue(new Error("db down"));
    const res = await handler(request());
    expect(res.status).toBe(500);
    // claim (processedAt set) then release (processedAt null)
    const sets = mocks.updateSet.mock.calls.map(
      (c) => c[0] as { processedAt: unknown }
    );
    expect(sets[0]!.processedAt).toBeInstanceOf(Date);
    expect(sets[1]!.processedAt).toBeNull();
  });

  it("refuses to serve without a webhook secret", async () => {
    const unconfigured = createStripeWebhookHandler({ secret: "" });
    expect((await unconfigured(request())).status).toBe(500);
  });
});
