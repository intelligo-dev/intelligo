/**
 * Revenue counts each payment once: an invoice, a paid one-time
 * checkout, a delayed checkout by its success event, and a paid local
 * invoice — and not a subscription checkout (its first invoice is
 * counted), an unpaid session, or a pending local invoice.
 *
 * The rows are in XTS, ISO 4217's code reserved for testing, so the
 * total is this suite's alone on a shared database.
 *
 * Runs against a real database when TEST_PG_URL is set. DATABASE_URL
 * must point at the same database.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

const suffix = Date.now();
const WORKSPACE = `ws_revenue_${suffix}`;

d("getRevenue (integration)", () => {
  const client = new Client({ connectionString: PG_URL });

  const event = (
    type: string,
    amountMinor: number,
    session?: { mode: string; payment_status: string }
  ) =>
    client.query(
      `INSERT INTO finance_events (id, workspace_id, stripe_event_id, type, amount_minor, currency, metadata)
       VALUES ($1, $2, $1, $3, $4, 'xts', $5)`,
      [
        `evt_revenue_${suffix}_${crypto.randomUUID()}`,
        WORKSPACE,
        type,
        amountMinor,
        JSON.stringify(session ?? { object: "invoice" }),
      ]
    );

  const payment = (status: string, amountMinor: number) =>
    client.query(
      `INSERT INTO payments (id, provider, invoice_id, workspace_id, reference, amount_minor, currency, status)
       VALUES ($1, 'mock', $1, $2, 'bundle', $3, 'XTS', $4)`,
      [
        `inv_revenue_${suffix}_${crypto.randomUUID()}`,
        WORKSPACE,
        amountMinor,
        status,
      ]
    );

  const cleanup = async () => {
    await client.query(`DELETE FROM finance_events WHERE currency = 'xts'`);
    await client.query(`DELETE FROM organization WHERE id = $1`, [WORKSPACE]);
  };

  beforeAll(async () => {
    await client.connect();
    await cleanup();
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at) VALUES ($1, 'Revenue', $1, now())`,
      [WORKSPACE]
    );

    await event("invoice.paid", 2900);
    await event("checkout.session.completed", 2900, {
      mode: "subscription",
      payment_status: "paid",
    });
    await event("checkout.session.completed", 500, {
      mode: "payment",
      payment_status: "paid",
    });
    await event("checkout.session.completed", 700, {
      mode: "payment",
      payment_status: "unpaid",
    });
    await event("checkout.session.async_payment_succeeded", 700, {
      mode: "payment",
      payment_status: "paid",
    });
    await event("invoice.payment_failed", 2900);
    await payment("paid", 1000);
    await payment("pending", 9000);
    await payment("failed", 9000);
  });

  afterAll(async () => {
    await cleanup();
    await client.end();
  });

  it("sums each payment received once, per currency", async () => {
    const { getRevenue } = await import("../usage");
    const revenue = await getRevenue();
    expect(revenue.filter((m) => m.currency === "XTS")).toEqual([
      { amount: (2900 + 500 + 700 + 1000) * 10_000, currency: "XTS" },
    ]);
  });
});
