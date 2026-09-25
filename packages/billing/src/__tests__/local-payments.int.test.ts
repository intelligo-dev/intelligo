/**
 * A QR-and-poll payment, opened and settled against a real database
 * through the mock provider: the invoice is recorded at the server's
 * price, a paid invoice grants once however often it is settled, an
 * invoice is invisible to every other workspace, and a failed one is
 * recorded as failed with nothing granted.
 *
 * Runs against a real database when TEST_PG_URL is set. DATABASE_URL
 * must point at the same database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

import { fromMajor, type Money } from "@intelligo-dev/core/money";

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

const suffix = Date.now();
const WORKSPACE = `ws_local_pay_${suffix}`;
const OTHER_WORKSPACE = `ws_local_pay_other_${suffix}`;
const USER = `user_local_pay_${suffix}`;
const PLAN = `local-pay-pro-${suffix}`;

d("local payments (integration)", () => {
  const client = new Client({ connectionString: PG_URL });
  let local: typeof import("../local-payments");
  let payment: typeof import("../payment");
  let ledgerCurrency: string;

  const row = async (invoiceId: string) =>
    (
      await client.query<{
        workspace_id: string;
        user_id: string | null;
        reference: string;
        amount_minor: number;
        currency: string;
        status: string;
        fulfilled_at: Date | null;
        provider: string;
      }>(
        `SELECT workspace_id, user_id, reference, amount_minor, currency, status, fulfilled_at, provider
           FROM payments WHERE invoice_id = $1`,
        [invoiceId]
      )
    ).rows[0];

  const balanceMicros = async (workspaceId = WORKSPACE) =>
    Number(
      (
        await client.query<{ balance_micros: string }>(
          `SELECT balance_micros FROM credit_balances WHERE workspace_id = $1`,
          [workspaceId]
        )
      ).rows[0]?.balance_micros ?? 0
    );

  const planOf = async () =>
    (
      await client.query<{ plan_id: string }>(
        `SELECT plan_id FROM subscriptions WHERE workspace_id = $1`,
        [WORKSPACE]
      )
    ).rows[0]?.plan_id ?? null;

  const credits = (): Money => fromMajor(5, ledgerCurrency);

  const open = (reference = "bundle-5") =>
    local.openLocalInvoice({
      workspaceId: WORKSPACE,
      userId: USER,
      reference,
      price: fromMajor(12.5, "USD"),
    });

  beforeAll(async () => {
    await client.connect();
    local = await import("../local-payments");
    payment = await import("../payment");
    const settings = await import("../billing-settings");
    ledgerCurrency = (await settings.getBillingSettings()).currency;
  });

  beforeEach(async () => {
    await client.query(`DELETE FROM organization WHERE id = ANY($1)`, [
      [WORKSPACE, OTHER_WORKSPACE],
    ]);
    await client.query(`DELETE FROM users WHERE id = $1`, [USER]);
    await client.query(`DELETE FROM plans WHERE slug = $1`, [PLAN]);
    await client.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'Buyer', $2, true, now(), now())`,
      [USER, `${USER}@example.test`]
    );
    for (const id of [WORKSPACE, OTHER_WORKSPACE]) {
      await client.query(
        `INSERT INTO organization (id, name, slug, created_at) VALUES ($1, 'Local pay', $1, now())`,
        [id]
      );
    }
    await client.query(
      `INSERT INTO plans (id, name, slug, price_monthly, price_yearly, features, limits)
       VALUES ($1, $2, $2, 0, 0, '[]', '{}')`,
      [`plan_${PLAN}`, PLAN]
    );
  });

  afterAll(async () => {
    await client.query(`DELETE FROM organization WHERE id = ANY($1)`, [
      [WORKSPACE, OTHER_WORKSPACE],
    ]);
    await client.query(`DELETE FROM users WHERE id = $1`, [USER]);
    await client.query(`DELETE FROM plans WHERE slug = $1`, [PLAN]);
    await client.end();
  });

  it("records the invoice at the server's price, pending", async () => {
    const invoice = await open();
    expect(invoice.qrCode).toBeTruthy();
    expect(payment.getMockPayment(invoice.invoiceId)?.amount).toBe(1250);
    expect(await row(invoice.invoiceId)).toMatchObject({
      workspace_id: WORKSPACE,
      user_id: USER,
      reference: "bundle-5",
      amount_minor: 1250,
      currency: "USD",
      status: "pending",
      fulfilled_at: null,
      provider: "mock",
    });
  });

  it("refuses a price in another currency than the provider charges in", async () => {
    payment.registerPaymentProvider("mnt-only", {
      ...payment.mockPaymentProvider,
      currency: "MNT",
    });
    const mode = process.env.PAYMENT_MODE;
    process.env.PAYMENT_MODE = "mnt-only";
    try {
      await expect(open("bundle-usd")).rejects.toMatchObject({
        code: "currency_mismatch",
      });
      const { rows } = await client.query(
        `SELECT 1 FROM payments WHERE reference = 'bundle-usd' AND workspace_id = $1`,
        [WORKSPACE]
      );
      expect(rows).toEqual([]);
    } finally {
      if (mode === undefined) delete process.env.PAYMENT_MODE;
      else process.env.PAYMENT_MODE = mode;
    }
  });

  it("reports an unpaid invoice as pending and grants nothing", async () => {
    const invoice = await open();
    let asked = 0;
    const status = await local.settleLocalInvoice({
      invoiceId: invoice.invoiceId,
      workspaceId: WORKSPACE,
      fulfil: () => {
        asked++;
        return { credits: credits() };
      },
    });
    expect(status).toBe("pending");
    expect(asked).toBe(0);
    expect(await balanceMicros()).toBe(0);
  });

  it("grants a paid invoice's credit once, however many polls settle it", async () => {
    const invoice = await open();
    payment.mockCompletePayment(invoice.invoiceId);

    const settle = () =>
      local.settleLocalInvoice({
        invoiceId: invoice.invoiceId,
        workspaceId: WORKSPACE,
        fulfil: () => ({ credits: credits() }),
      });

    expect(await Promise.all([settle(), settle(), settle()])).toEqual([
      "paid",
      "paid",
      "paid",
    ]);
    expect(await settle()).toBe("paid");

    expect(await balanceMicros()).toBe(credits().amount);
    const settled = await row(invoice.invoiceId);
    expect(settled?.status).toBe("paid");
    expect(settled?.fulfilled_at).toBeInstanceOf(Date);
  });

  it("puts the workspace on a paid-for plan", async () => {
    const invoice = await open(PLAN);
    payment.mockCompletePayment(invoice.invoiceId);

    const status = await local.settleLocalInvoice({
      invoiceId: invoice.invoiceId,
      workspaceId: WORKSPACE,
      fulfil: (p) => ({ plan: p.reference }),
    });
    expect(status).toBe("paid");
    expect(await planOf()).toBe(`plan_${PLAN}`);
  });

  it("leaves the invoice unfulfilled when the grant fails, so the next poll retries", async () => {
    const invoice = await open();
    payment.mockCompletePayment(invoice.invoiceId);

    await expect(
      local.settleLocalInvoice({
        invoiceId: invoice.invoiceId,
        workspaceId: WORKSPACE,
        fulfil: () => ({ plan: "no-such-plan" }),
      })
    ).rejects.toMatchObject({ code: "invalid_plan" });
    expect(await row(invoice.invoiceId)).toMatchObject({
      status: "pending",
      fulfilled_at: null,
    });

    expect(
      await local.settleLocalInvoice({
        invoiceId: invoice.invoiceId,
        workspaceId: WORKSPACE,
        fulfil: () => ({ credits: credits() }),
      })
    ).toBe("paid");
    expect(await balanceMicros()).toBe(credits().amount);
  });

  it("does not let another workspace settle the invoice", async () => {
    const invoice = await open();
    payment.mockCompletePayment(invoice.invoiceId);

    await expect(
      local.settleLocalInvoice({
        invoiceId: invoice.invoiceId,
        workspaceId: OTHER_WORKSPACE,
        fulfil: () => ({ credits: credits() }),
      })
    ).rejects.toMatchObject({ code: "payment_not_found" });

    expect(await balanceMicros(OTHER_WORKSPACE)).toBe(0);
    expect(await balanceMicros()).toBe(0);
    expect(await row(invoice.invoiceId)).toMatchObject({
      status: "pending",
      fulfilled_at: null,
    });
  });

  it("records a failed invoice and grants nothing", async () => {
    const invoice = await open();
    await payment.mockPaymentProvider.cancelPayment(invoice.invoiceId);

    const settle = () =>
      local.settleLocalInvoice({
        invoiceId: invoice.invoiceId,
        workspaceId: WORKSPACE,
        fulfil: () => ({ credits: credits() }),
      });
    expect(await settle()).toBe("failed");
    expect(await row(invoice.invoiceId)).toMatchObject({
      status: "failed",
      fulfilled_at: null,
    });

    // A late "paid" from the provider does not revive a failed invoice.
    payment.getMockPayment(invoice.invoiceId)!.status = "paid";
    expect(await settle()).toBe("failed");
    expect(await balanceMicros()).toBe(0);
  });

  it("refuses a paid amount other than the invoiced one", async () => {
    const invoice = await open();
    payment.mockCompletePayment(invoice.invoiceId);
    payment.getMockPayment(invoice.invoiceId)!.amount = 1;

    await expect(
      local.settleLocalInvoice({
        invoiceId: invoice.invoiceId,
        workspaceId: WORKSPACE,
        fulfil: () => ({ credits: credits() }),
      })
    ).rejects.toMatchObject({ code: "payment_mismatch" });
    expect(await balanceMicros()).toBe(0);
  });
});
