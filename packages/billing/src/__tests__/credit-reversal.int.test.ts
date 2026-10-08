/**
 * A refunded or disputed credit purchase against a real database: the
 * refunded share of the grant leaves the balance, never below zero, a
 * redelivered event takes nothing more, partial refunds add up to the
 * grant and no further, and a purchase refunded before it was granted
 * is never granted. Stripe is mocked.
 *
 * Runs against a real database when TEST_PG_URL is set. DATABASE_URL
 * must point at the same database.
 */

import type Stripe from "stripe";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Client } from "pg";

const stripe = vi.hoisted(() => ({
  sessionsList: vi.fn(),
  chargesRetrieve: vi.fn(),
}));

vi.mock("../stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { list: stripe.sessionsList } },
    charges: { retrieve: stripe.chargesRetrieve },
  }),
}));

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

const WORKSPACE = `ws_credit_reversal_${Date.now()}`;
const PURCHASE = `purchase_${WORKSPACE}`;
const INTENT = `pi_${WORKSPACE}`;
const GRANTED = 40_000_000;

d("credit purchase reversal (integration)", () => {
  const client = new Client({ connectionString: PG_URL });
  let handlers: typeof import("../webhook-handlers");
  let currency: string;

  const balance = async () =>
    (
      await client.query<{ balance: string; purchased: string }>(
        `SELECT balance_micros AS balance, total_purchased_micros AS purchased
           FROM credit_balances WHERE workspace_id = $1`,
        [WORKSPACE]
      )
    ).rows[0];
  const purchaseStatus = async () =>
    (
      await client.query<{ status: string }>(
        `SELECT status FROM credit_purchases WHERE id = $1`,
        [PURCHASE]
      )
    ).rows[0]?.status;

  const charge = (refunded: number, over: Record<string, unknown> = {}) =>
    ({
      id: `ch_${WORKSPACE}`,
      amount: 3500,
      amount_refunded: refunded,
      refunded: refunded >= 3500,
      payment_intent: INTENT,
      ...over,
    }) as unknown as Stripe.Charge;

  beforeAll(async () => {
    await client.connect();
    handlers = await import("../webhook-handlers");
    const settings = await import("../billing-settings");
    currency = (await settings.getBillingSettings()).currency;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    stripe.sessionsList.mockResolvedValue({ data: [] });
    await client.query(`DELETE FROM organization WHERE id = $1`, [WORKSPACE]);
    await client.query(
      `INSERT INTO organization (id, name, slug) VALUES ($1, 'Reversal', $1)`,
      [WORKSPACE]
    );
    await client.query(
      `INSERT INTO credit_purchases (id, workspace_id, granted_micros, granted_currency, stripe_payment_intent_id, stripe_checkout_session_id, status)
       VALUES ($1, $2, $3, $4, $5, 'cs_1', 'completed')`,
      [PURCHASE, WORKSPACE, GRANTED, currency, INTENT]
    );
    await client.query(
      `INSERT INTO credit_balances (id, workspace_id, balance_micros, total_purchased_micros, currency)
       VALUES ($1, $1, $2, $2, $3)`,
      [WORKSPACE, GRANTED, currency]
    );
  });

  afterAll(async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [WORKSPACE]);
    await client.end();
  });

  it("takes a fully refunded purchase's credit back once, however often the event arrives", async () => {
    await handlers.handleChargeRefunded(charge(3500));
    await handlers.handleChargeRefunded(charge(3500));

    expect(await balance()).toEqual({ balance: "0", purchased: "0" });
    expect(await purchaseStatus()).toBe("refunded");
  });

  it("takes back each partial refund's share, up to the grant", async () => {
    await handlers.handleChargeRefunded(charge(1750));
    expect(await balance()).toMatchObject({ balance: String(GRANTED / 2) });
    expect(await purchaseStatus()).toBe("completed");

    await handlers.handleChargeRefunded(charge(1750));
    expect(await balance()).toMatchObject({ balance: String(GRANTED / 2) });

    await handlers.handleChargeRefunded(charge(3500));
    expect(await balance()).toMatchObject({ balance: "0" });
    expect(await purchaseStatus()).toBe("refunded");
  });

  it("never takes the balance below zero when the credit was already spent", async () => {
    await client.query(
      `UPDATE credit_balances SET balance_micros = 10000000 WHERE workspace_id = $1`,
      [WORKSPACE]
    );
    await handlers.handleChargeRefunded(charge(3500));
    expect(await balance()).toEqual({ balance: "0", purchased: "0" });
  });

  it("takes the disputed share back and never more than the grant after a refund", async () => {
    stripe.chargesRetrieve.mockResolvedValue(charge(0));
    await handlers.handleChargeRefunded(charge(1750));
    await handlers.handleChargeDisputeCreated({
      id: `dp_${WORKSPACE}`,
      amount: 3500,
      charge: `ch_${WORKSPACE}`,
      payment_intent: INTENT,
    } as unknown as Stripe.Dispute);

    expect(await balance()).toMatchObject({ balance: "0" });
    expect(await purchaseStatus()).toBe("disputed");
    const { rows } = await client.query<{ total: string }>(
      `SELECT sum(charged_micros) AS total FROM usage_records
        WHERE workspace_id = $1 AND type = 'credit'`,
      [WORKSPACE]
    );
    expect(Number(rows[0]!.total)).toBe(GRANTED);
  });

  it("finds a purchase recorded without its payment intent through its checkout session", async () => {
    await client.query(
      `UPDATE credit_purchases SET stripe_payment_intent_id = NULL WHERE id = $1`,
      [PURCHASE]
    );
    stripe.sessionsList.mockResolvedValue({ data: [{ id: "cs_1" }] });
    await handlers.handleChargeRefunded(charge(3500));
    expect(await balance()).toMatchObject({ balance: "0" });
  });

  it("never grants a purchase refunded before its payment was confirmed", async () => {
    await client.query(
      `UPDATE credit_purchases SET status = 'pending' WHERE id = $1`,
      [PURCHASE]
    );
    await handlers.handleChargeRefunded(charge(3500));
    expect(await purchaseStatus()).toBe("refunded");

    await handlers.handleCheckoutAsyncPaymentSucceeded({
      id: "cs_1",
      mode: "payment",
      payment_status: "paid",
      payment_intent: INTENT,
      metadata: { workspaceId: WORKSPACE, purchaseId: PURCHASE },
    } as unknown as Stripe.Checkout.Session);
    expect(await purchaseStatus()).toBe("refunded");
    expect(await balance()).toMatchObject({ balance: String(GRANTED) });
  });

  it("ignores a refunded charge that bought no credit", async () => {
    await handlers.handleChargeRefunded(
      charge(3500, { payment_intent: "pi_subscription_invoice" })
    );
    expect(await balance()).toMatchObject({ balance: String(GRANTED) });
  });
});
