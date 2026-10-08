/**
 * A QR-and-poll payment, opened and settled against a real database
 * through the mock provider: the invoice is recorded at the server's
 * price, a paid invoice grants once however often it is settled, an
 * invoice is invisible to every other workspace, a failed one is
 * recorded as failed with nothing granted, and one unpaid past its
 * expiry is cancelled.
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
      amount_minor: "1250",
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

  const withProvider = async <T>(
    provider: import("../payment").PaymentProvider,
    run: () => Promise<T>
  ): Promise<T> => {
    payment.registerPaymentProvider("under-test", provider);
    const mode = process.env.PAYMENT_MODE;
    process.env.PAYMENT_MODE = "under-test";
    try {
      return await run();
    } finally {
      if (mode === undefined) delete process.env.PAYMENT_MODE;
      else process.env.PAYMENT_MODE = mode;
    }
  };

  const paymentRow = async (invoiceId: string) =>
    (
      await client.query<{ id: string; expires_ms: string | null }>(
        // A timestamp without time zone holds UTC; epoch reads it as such.
        `SELECT id, extract(epoch FROM expires_at) * 1000 AS expires_ms
           FROM payments WHERE invoice_id = $1`,
        [invoiceId]
      )
    ).rows[0];

  it("hands the provider the recorded payment's id and records the expiry", async () => {
    let paymentId: string | undefined;
    const invoice = await withProvider(
      {
        ...payment.mockPaymentProvider,
        createPayment: (params) => {
          paymentId = params.paymentId;
          return payment.mockPaymentProvider.createPayment(params);
        },
      },
      () => open()
    );

    const recorded = await paymentRow(invoice.invoiceId);
    expect(recorded?.id).toBe(paymentId);
    expect(Number(recorded?.expires_ms)).toBe(invoice.expiresAt.getTime());
  });

  it("records an invoice the provider refused as failed", async () => {
    await expect(
      withProvider(
        {
          ...payment.mockPaymentProvider,
          createPayment: async () => {
            throw new Error("provider down");
          },
        },
        () => open("bundle-refused")
      )
    ).rejects.toThrow("provider down");

    const { rows } = await client.query<{
      status: string;
      invoice_id: string | null;
    }>(
      `SELECT status, invoice_id FROM payments WHERE reference = 'bundle-refused' AND workspace_id = $1`,
      [WORKSPACE]
    );
    expect(rows).toEqual([{ status: "failed", invoice_id: null }]);
  });

  it("cancels an invoice still unpaid past its expiry", async () => {
    const invoice = await open();
    await client.query(
      `UPDATE payments SET expires_at = now() - interval '1 day' WHERE invoice_id = $1`,
      [invoice.invoiceId]
    );

    const status = await local.settleLocalInvoice({
      invoiceId: invoice.invoiceId,
      workspaceId: WORKSPACE,
      fulfil: () => ({ credits: credits() }),
    });

    expect(status).toBe("failed");
    expect(payment.getMockPayment(invoice.invoiceId)?.status).toBe("expired");
    expect((await row(invoice.invoiceId))?.status).toBe("failed");
  });

  it("grants an invoice paid after its expiry but before it was cancelled", async () => {
    const invoice = await open();
    await client.query(
      `UPDATE payments SET expires_at = now() - interval '1 day' WHERE invoice_id = $1`,
      [invoice.invoiceId]
    );
    payment.mockCompletePayment(invoice.invoiceId);

    expect(
      await local.settleLocalInvoice({
        invoiceId: invoice.invoiceId,
        workspaceId: WORKSPACE,
        fulfil: () => ({ credits: credits() }),
      })
    ).toBe("paid");
    expect(await balanceMicros()).toBe(credits().amount);
  });

  it("grants the terms the invoice was opened with, without asking fulfil", async () => {
    const invoice = await local.openLocalInvoice({
      workspaceId: WORKSPACE,
      userId: USER,
      reference: "bundle-5",
      price: fromMajor(12.5, "USD"),
      grant: { credits: credits() },
    });
    payment.mockCompletePayment(invoice.invoiceId);

    const status = await local.settleLocalInvoice({
      invoiceId: invoice.invoiceId,
      workspaceId: WORKSPACE,
      fulfil: () => {
        throw new Error("the offer has changed since");
      },
    });

    expect(status).toBe("paid");
    expect(await balanceMicros()).toBe(credits().amount);
  });

  it("grants a stored plan for its stored number of days", async () => {
    const invoice = await local.openLocalInvoice({
      workspaceId: WORKSPACE,
      userId: USER,
      reference: "renamed-offer",
      price: fromMajor(12.5, "USD"),
      grant: { plan: PLAN, days: 7 },
    });
    payment.mockCompletePayment(invoice.invoiceId);

    await local.settleLocalInvoice({
      invoiceId: invoice.invoiceId,
      workspaceId: WORKSPACE,
      fulfil: () => ({ plan: "no-such-plan" }),
    });

    expect(await planOf()).toBe(`plan_${PLAN}`);
    const { rows } = await client.query<{ days: string }>(
      `SELECT round(extract(epoch FROM current_period_end - current_period_start) / 86400) AS days
       FROM subscriptions WHERE workspace_id = $1`,
      [WORKSPACE]
    );
    expect(Number(rows[0]!.days)).toBe(7);
  });

  it("refuses to sell a plan to a workspace a Stripe subscription bills, and still sells it credit", async () => {
    await client.query(
      `INSERT INTO subscriptions (id, workspace_id, plan_id, status, stripe_subscription_id)
       VALUES ($1, $2, $3, 'active', 'sub_live')`,
      [`sub_${WORKSPACE}`, WORKSPACE, `plan_${PLAN}`]
    );
    await expect(
      local.openLocalInvoice({
        workspaceId: WORKSPACE,
        userId: USER,
        reference: "plan-offer",
        price: fromMajor(12.5, "USD"),
        grant: { plan: PLAN, days: 30 },
      })
    ).rejects.toMatchObject({ code: "subscription_active" });
    const { rows } = await client.query(
      `SELECT 1 FROM payments WHERE reference = 'plan-offer' AND workspace_id = $1`,
      [WORKSPACE]
    );
    expect(rows).toEqual([]);

    await expect(
      local.openLocalInvoice({
        workspaceId: WORKSPACE,
        userId: USER,
        reference: "credit-offer",
        price: fromMajor(12.5, "USD"),
        grant: { credits: credits() },
      })
    ).resolves.toMatchObject({ invoiceId: expect.any(String) });
  });

  it("sells a plan to a workspace whose Stripe subscription was canceled", async () => {
    await client.query(
      `INSERT INTO subscriptions (id, workspace_id, plan_id, status, stripe_subscription_id)
       VALUES ($1, $2, $3, 'canceled', NULL)`,
      [`sub_${WORKSPACE}`, WORKSPACE, `plan_${PLAN}`]
    );
    await expect(
      local.openLocalInvoice({
        workspaceId: WORKSPACE,
        userId: USER,
        reference: "plan-offer",
        price: fromMajor(12.5, "USD"),
        grant: { plan: PLAN, days: 30 },
      })
    ).resolves.toMatchObject({ invoiceId: expect.any(String) });
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

  it("ends a plan bought for a number of days", async () => {
    const invoice = await open(PLAN);
    payment.mockCompletePayment(invoice.invoiceId);

    await local.settleLocalInvoice({
      invoiceId: invoice.invoiceId,
      workspaceId: WORKSPACE,
      fulfil: (p) => ({ plan: p.reference, days: 30 }),
    });

    const { rows } = await client.query<{ days: string }>(
      `SELECT round(extract(epoch FROM current_period_end - current_period_start) / 86400) AS days
       FROM subscriptions WHERE workspace_id = $1`,
      [WORKSPACE]
    );
    expect(Number(rows[0]!.days)).toBe(30);
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

  describe("settlePendingLocalInvoices", () => {
    const grantCredits = () => ({ credits: credits() });
    const sweep = (extra: { invoiceId?: string; deadlineMs?: number } = {}) =>
      local.settlePendingLocalInvoices({
        fulfil: grantCredits,
        openedBefore: new Date(Date.now() + 60_000),
        ...extra,
      });

    it("grants an invoice paid after the buyer's tab closed", async () => {
      const invoice = await open();
      payment.mockCompletePayment(invoice.invoiceId);

      const result = await sweep();

      expect(result.errors).toEqual([]);
      expect(result.paid).toBeGreaterThanOrEqual(1);
      expect(await balanceMicros()).toBe(credits().amount);
      expect((await row(invoice.invoiceId))?.fulfilled_at).toBeInstanceOf(Date);

      await sweep();
      expect(await balanceMicros()).toBe(credits().amount);
    });

    it("leaves an invoice the buyer's tab may still be polling", async () => {
      const invoice = await open();
      payment.mockCompletePayment(invoice.invoiceId);

      await local.settlePendingLocalInvoices({ fulfil: grantCredits });

      expect((await row(invoice.invoiceId))?.status).toBe("pending");
      expect(await balanceMicros()).toBe(0);
    });

    it("marks an invoice the provider no longer knows failed", async () => {
      const invoice = await open();
      await payment.mockPaymentProvider.cancelPayment(invoice.invoiceId);

      await sweep();

      expect((await row(invoice.invoiceId))?.status).toBe("failed");
    });

    it("grants nothing for a callback naming an unpaid invoice", async () => {
      const invoice = await open();

      const result = await sweep({ invoiceId: invoice.invoiceId });

      expect(result).toMatchObject({ paid: 0, pending: 1, errors: [] });
      expect(await balanceMicros()).toBe(0);
    });

    it("settles a callback's invoice into the workspace that opened it", async () => {
      const invoice = await local.openLocalInvoice({
        workspaceId: OTHER_WORKSPACE,
        userId: USER,
        reference: "bundle-5",
        price: fromMajor(12.5, "USD"),
      });
      payment.mockCompletePayment(invoice.invoiceId);

      const result = await local.settlePendingLocalInvoices({
        invoiceId: invoice.invoiceId,
        fulfil: grantCredits,
      });

      expect(result.paid).toBe(1);
      expect(await balanceMicros(OTHER_WORKSPACE)).toBe(credits().amount);
      expect(await balanceMicros()).toBe(0);
    });

    it("settles an invoice opened days ago that has not expired", async () => {
      const invoice = await open();
      await client.query(
        `UPDATE payments
            SET created_at = now() - interval '3 days',
                expires_at = now() + interval '1 day'
          WHERE invoice_id = $1`,
        [invoice.invoiceId]
      );
      payment.mockCompletePayment(invoice.invoiceId);

      await sweep();

      expect((await row(invoice.invoiceId))?.status).toBe("paid");
      expect(await balanceMicros()).toBe(credits().amount);
    });

    it("settles a callback that names the recorded payment's id", async () => {
      const invoice = await open();
      payment.mockCompletePayment(invoice.invoiceId);
      const { id } = (await paymentRow(invoice.invoiceId))!;

      const result = await local.settlePendingLocalInvoices({
        invoiceId: id,
        fulfil: grantCredits,
      });

      expect(result.paid).toBe(1);
      expect(await balanceMicros()).toBe(credits().amount);
    });

    it("reports a grant that throws and keeps settling the rest", async () => {
      const failing = await open();
      const fine = await open("bundle-ok");
      payment.mockCompletePayment(failing.invoiceId);
      payment.mockCompletePayment(fine.invoiceId);

      const result = await local.settlePendingLocalInvoices({
        openedBefore: new Date(Date.now() + 60_000),
        fulfil: (p) => {
          if (p.invoiceId === failing.invoiceId) throw new Error("unpriced");
          return grantCredits();
        },
      });

      expect(result.errors.join()).toContain(failing.invoiceId);
      expect((await row(failing.invoiceId))?.fulfilled_at).toBeNull();
      expect((await row(fine.invoiceId))?.fulfilled_at).toBeInstanceOf(Date);
    });

    it("grants an invoice its callback names after a failed read proved wrong", async () => {
      const invoice = await open();
      await payment.mockPaymentProvider.cancelPayment(invoice.invoiceId);
      await local.settleLocalInvoice({
        invoiceId: invoice.invoiceId,
        workspaceId: WORKSPACE,
        fulfil: grantCredits,
      });
      expect((await row(invoice.invoiceId))?.status).toBe("failed");

      // The bank completes it after all; the provider calls back.
      payment.getMockPayment(invoice.invoiceId)!.status = "paid";
      expect((await sweep()).paid).toBe(0);
      const result = await sweep({ invoiceId: invoice.invoiceId });

      expect(result.paid).toBe(1);
      expect(await row(invoice.invoiceId)).toMatchObject({ status: "paid" });
      expect(await balanceMicros()).toBe(credits().amount);
    });

    it("leaves a failed invoice failed when its callback finds it still unpaid", async () => {
      const invoice = await open();
      await payment.mockPaymentProvider.cancelPayment(invoice.invoiceId);
      await sweep({ invoiceId: invoice.invoiceId });

      const result = await sweep({ invoiceId: invoice.invoiceId });

      expect(result).toMatchObject({ paid: 0, failed: 1 });
      expect((await row(invoice.invoiceId))?.status).toBe("failed");
    });

    it("does not let an invoice that fails every run hold the others back", async () => {
      const failing = await open();
      const fine = await open("bundle-ok");
      payment.mockCompletePayment(failing.invoiceId);
      payment.mockCompletePayment(fine.invoiceId);
      const fulfil = (p: { invoiceId: string | null }) => {
        if (p.invoiceId === failing.invoiceId) throw new Error("unpriced");
        return grantCredits();
      };

      // One invoice per run: picked oldest first, the failing one (opened
      // first) would be the only one ever tried.
      for (let run = 0; run < 40; run++) {
        if ((await row(fine.invoiceId))?.fulfilled_at) break;
        await local.settlePendingLocalInvoices({
          openedBefore: new Date(Date.now() + 60_000),
          limit: 1,
          fulfil,
        });
      }

      expect((await row(fine.invoiceId))?.fulfilled_at).toBeInstanceOf(Date);
    });

    it("starts nothing once its deadline has passed", async () => {
      const invoice = await open();
      payment.mockCompletePayment(invoice.invoiceId);

      const result = await sweep({ deadlineMs: 0 });

      expect(result).toMatchObject({ paid: 0, deferred: 1, errors: [] });
      expect((await row(invoice.invoiceId))?.fulfilled_at).toBeNull();
    });
  });
});
