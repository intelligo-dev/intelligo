/**
 * The money path, end to end, against a real database.
 *
 * The billing unit tests mock drizzle and the execution integration
 * test binds stub ports, so the one composition nobody else runs is
 * the real one: `checkQuota` admission with its advisory lock and
 * reservation, `recordTokenUsage` settlement with its ordered debit,
 * and the Stripe checkout handler crediting a balance that admission
 * can then spend. Being wrong here costs money in both directions.
 *
 * What it pins down:
 *   a purchase is spendable; one charge debits the pools exactly once
 *   (allowance first, top-up for the remainder); a failed run releases
 *   its hold; a refusal charges nothing; and two concurrent admissions
 *   against a balance that fits one admit exactly one.
 *
 * Runs only when TEST_PG_URL is set (CI points it at the replayed
 * database). DATABASE_URL must point at the same database.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Client } from "pg";

import { money } from "@intelligo-dev/core/money";

/**
 * Whole tugrik as micros, so the figures below — a 2,000₮ allowance, a
 * 50,000₮ top-up — read as themselves rather than as nine zeroes.
 */
const mnt = (whole: number) => whole * 1_000_000;

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

d("money path (integration)", () => {
  const client = new Client({ connectionString: PG_URL });
  const suffix = Date.now();
  const workspaceId = `money-ws-${suffix}`;
  const userId = `money-user-${suffix}`;
  const product = `money-it-${suffix}`;
  const FREE_ALLOWANCE = 2_000;

  // Imported lazily: these modules read DATABASE_URL at first use, and
  // importing them at module load would bind the driver before the
  // suite decides whether it is running at all.
  let executions: ReturnType<
    typeof import("@intelligo-dev/executions").createExecutions
  >;
  let settle: typeof import("../quota").recordTokenUsage;
  let handleCheckoutCompleted: typeof import("../webhook-handlers").handleCheckoutCompleted;

  async function balanceMicros(): Promise<number> {
    const { rows } = await client.query<{ balance_micros: string }>(
      `SELECT balance_micros FROM credit_balances WHERE workspace_id = $1`,
      [workspaceId]
    );
    return Number(rows[0]?.balance_micros ?? 0);
  }

  async function allowanceUsedMicros(): Promise<number> {
    const { rows } = await client.query<{ allowance_used_micros: string }>(
      `SELECT allowance_used_micros FROM monthly_usage WHERE workspace_id = $1`,
      [workspaceId]
    );
    return Number(rows[0]?.allowance_used_micros ?? 0);
  }

  async function activeReservations(): Promise<number> {
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM credit_reservations
        WHERE workspace_id = $1 AND status = 'active'`,
      [workspaceId]
    );
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * The engine's own period bounds. Writing `date_trunc('month', now())`
   * in SQL instead would agree only while Postgres runs in UTC.
   */
  async function periodBounds(): Promise<{ start: Date; end: Date }> {
    const { getCurrentPeriodStart, getCurrentPeriodEnd } =
      await import("../quota-usage");
    return { start: getCurrentPeriodStart(), end: getCurrentPeriodEnd() };
  }

  /**
   * A timestamp as drizzle binds it to a naive `timestamp` column: UTC
   * wall clock.
   *
   * node-postgres binds a JS `Date` as *local* wall clock instead, so on
   * a machine east of UTC the two write different keys for the same
   * instant and the engine's drizzle queries find nothing.
   */
  const naive = (date: Date) =>
    date.toISOString().slice(0, 19).replace("T", " ");

  async function setAllowanceUsed(micros: number): Promise<void> {
    const { start, end } = await periodBounds();
    await client.query(
      `INSERT INTO monthly_usage (id, workspace_id, period_start, period_end, allowance_used_micros, currency)
            VALUES ($1, $2, $3, $4, $5, 'MNT')
       ON CONFLICT (workspace_id, period_start)
       DO UPDATE SET allowance_used_micros = EXCLUDED.allowance_used_micros`,
      [`mu-${suffix}`, workspaceId, naive(start), naive(end), micros]
    );
  }

  async function setBalance(micros: number): Promise<void> {
    await client.query(
      `INSERT INTO credit_balances (id, workspace_id, balance_micros, currency)
            VALUES ($1, $2, $3, 'MNT')
       ON CONFLICT (workspace_id)
       DO UPDATE SET balance_micros = EXCLUDED.balance_micros`,
      [`cb-${suffix}`, workspaceId, micros]
    );
  }

  const begin = () =>
    executions.begin({
      workspaceId,
      userId,
      capability: "chat.message",
      model: "openai/gpt-5-mini",
    });

  beforeAll(async () => {
    await client.connect();
    await client.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'Money IT', $2, true, now(), now())`,
      [userId, `money-it-${suffix}@example.test`]
    );
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at, updated_at)
       VALUES ($1, 'Money IT WS', $2, now(), now())`,
      [workspaceId, product]
    );

    // The FX rate and margin come from a singleton row; without it
    // every estimate is zero and admission becomes meaningless.
    //
    // Written directly rather than through `ensureBillingSettingsRow`,
    // which is `onConflictDoNothing` and so cannot correct a row that
    // already exists. Every figure below is tugrik, and a deployment
    // billing in anything else yields a zero allowance rather than a
    // silent conversion.
    const { ensureBillingSettingsRow, invalidateBillingSettingsCache } =
      await import("../billing-settings");
    await ensureBillingSettingsRow();
    await client.query(
      `UPDATE billing_settings
          SET currency = 'MNT', usd_rate_micros = 3450000000, margin_bp = 40000
        WHERE id = 'default'`
    );
    invalidateBillingSettingsCache();

    // Compose in-test what a consumer's lib/intelligo.ts composes: a
    // product with a free plan, and the three ports bound to billing.
    const { setDefaultProductSlug, registerProductPlans } =
      await import("../plans");
    setDefaultProductSlug(product);
    registerProductPlans(product, {
      free: {
        name: "Free",
        slug: "free",
        description: "",
        priceOneTime: 0,
        targetAudience: "",
        aiModelLabel: "",
        monthlyAllowance: money(FREE_ALLOWANCE * 1_000_000, "MNT"),
        limits: {
          chatMessages: 30,
        },
        features: [],
      },
    });

    // What each model costs. A consumer's composition root registers
    // this; without it admission has no price to estimate against and
    // refuses every request with `unknown_model`.
    const { DEFAULT_MODELS, registerModels } =
      await import("@intelligo-dev/executions");
    registerModels(DEFAULT_MODELS);

    const { checkQuota, recordTokenUsage, releaseReservation } =
      await import("../quota");
    settle = recordTokenUsage;
    const { createExecutions } = await import("@intelligo-dev/executions");
    executions = createExecutions({
      async checkEntitlement({ workspaceId: ws, requestId, model }) {
        const q = await checkQuota(ws, { modelId: model, requestId });
        return {
          allowed: q.allowed,
          reason: q.reason,
          estimated: q.estimated,
          usingTrialCredits: q.usingTrialCredits,
        };
      },
      settleUsage: (s) =>
        recordTokenUsage({
          workspaceId: s.workspaceId,
          userId: s.userId ?? "",
          model: s.model ?? "unknown",
          agent: s.capability,
          inputTokens: s.inputTokens,
          outputTokens: s.outputTokens,
          totalTokens: s.totalTokens,
          usingTrialCredits: s.usingTrialCredits,
          requestId: s.requestId,
          metadata: s.metadata,
        }),
      releaseHold: ({ requestId }) => releaseReservation(requestId),
    });

    ({ handleCheckoutCompleted } = await import("../webhook-handlers"));
  });

  afterAll(async () => {
    for (const table of [
      "usage_records",
      "monthly_usage",
      "credit_reservations",
      "credit_balances",
      "credit_purchases",
      "executions",
    ]) {
      await client
        .query(`DELETE FROM ${table} WHERE workspace_id = $1`, [workspaceId])
        .catch(() => {});
    }
    await client.query(`DELETE FROM organization WHERE id = $1`, [workspaceId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await client.end();
  });

  beforeEach(async () => {
    for (const table of [
      "credit_reservations",
      "usage_records",
      "monthly_usage",
      "credit_purchases",
    ]) {
      await client.query(`DELETE FROM ${table} WHERE workspace_id = $1`, [
        workspaceId,
      ]);
    }
    await setBalance(0);
  });

  it("makes a purchase spendable: refused before the credit, admitted after", async () => {
    await setAllowanceUsed(mnt(FREE_ALLOWANCE));
    expect((await begin()).allowed).toBe(false);

    const purchaseId = `cp-${suffix}`;
    await client.query(
      `INSERT INTO credit_purchases
         (id, workspace_id, price_minor, price_currency, granted_micros, granted_currency,
          stripe_checkout_session_id, status)
       VALUES ($1, $2, 500, 'USD', $3, 'MNT', 'pending', 'pending')`,
      [purchaseId, workspaceId, mnt(50_000)]
    );
    await handleCheckoutCompleted({
      id: `cs_${suffix}`,
      mode: "payment",
      // Credits wait for the money: the handler grants nothing unless
      // the session actually paid, because Stripe completes a session
      // for delayed-notification methods before the money arrives. A
      // fixture without this says "unpaid" and grants nothing.
      payment_status: "paid",
      metadata: { workspaceId, purchaseId },
    } as never);

    expect(await balanceMicros()).toBe(mnt(50_000));

    // A replayed webhook must not credit twice.
    await handleCheckoutCompleted({
      id: `cs_${suffix}`,
      mode: "payment",
      payment_status: "paid",
      metadata: { workspaceId, purchaseId },
    } as never);
    expect(await balanceMicros()).toBe(mnt(50_000));

    const run = await begin();
    expect(run.allowed).toBe(true);
    await run.fail({ error: new Error("cleanup") });
  });

  it("charges exactly once: allowance first, top-up for the remainder", async () => {
    // 1₮ of allowance left and a funded top-up: any charge must take
    // that 1₮ from the allowance and the rest from the balance — not
    // the full amount from both. (1, not a larger number: the charge
    // depends on the FX/margin row, and the test must not guess it.)
    await setAllowanceUsed(mnt(FREE_ALLOWANCE - 1));
    await setBalance(mnt(50_000));

    const run = await begin();
    expect(run.allowed).toBe(true);
    await run.complete({
      usage: { inputTokens: 20_000, outputTokens: 4_000, totalTokens: 24_000 },
      model: "openai/gpt-5-mini",
    });

    const { rows } = await client.query<{ charged_micros: string }>(
      `SELECT charged_micros FROM usage_records WHERE workspace_id = $1`,
      [workspaceId]
    );
    expect(rows).toHaveLength(1);
    const charged = Number(rows[0]!.charged_micros);
    expect(charged).toBeGreaterThan(1);

    const planPortion = (await allowanceUsedMicros()) - mnt(FREE_ALLOWANCE - 1);
    const topupPortion = mnt(50_000) - (await balanceMicros());
    expect(planPortion).toBe(mnt(1));
    expect(planPortion + topupPortion).toBe(charged);
    expect(await activeReservations()).toBe(0);
  });

  it("funds a charge entirely from the allowance without touching the top-up", async () => {
    await setBalance(mnt(50_000));

    const run = await begin();
    expect(run.allowed).toBe(true);
    await run.complete({
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      model: "openai/gpt-5-mini",
    });

    expect(await balanceMicros()).toBe(mnt(50_000));
    expect(await allowanceUsedMicros()).toBeGreaterThan(0);
  });

  it("releases the hold when the run fails, and charges nothing", async () => {
    await setBalance(mnt(50_000));

    const run = await begin();
    expect(run.allowed).toBe(true);
    await run.fail({ error: new Error("provider exploded") });

    expect(await activeReservations()).toBe(0);
    expect(await balanceMicros()).toBe(mnt(50_000));
    expect(await allowanceUsedMicros()).toBe(0);
  });

  it("refuses when nothing is left, and leaves no reservation behind", async () => {
    await setAllowanceUsed(mnt(FREE_ALLOWANCE));

    const run = await begin();
    expect(run.allowed).toBe(false);
    expect(run.reason).toBeTruthy();
    expect(await activeReservations()).toBe(0);

    const { rows } = await client.query<{ status: string }>(
      `SELECT status FROM executions WHERE id = $1`,
      [run.id]
    );
    expect(rows[0]?.status).toBe("refused");
  });

  it("admits exactly one of two concurrent runs when the balance fits one", async () => {
    await setAllowanceUsed(mnt(FREE_ALLOWANCE));

    const probe = await begin();
    expect(probe.allowed).toBe(false);
    const estimate = probe.estimated?.amount ?? 0;
    expect(estimate).toBeGreaterThan(0);

    await setBalance(estimate);

    const [a, b] = await Promise.all([begin(), begin()]);
    const admitted = [a, b].filter((r) => r.allowed);
    expect(admitted).toHaveLength(1);
    expect(await activeReservations()).toBe(1);

    await Promise.all(
      admitted.map((r) => r.fail({ error: new Error("cleanup") }))
    );
  });

  it("settles a request once however often settlement is called", async () => {
    await setAllowanceUsed(mnt(FREE_ALLOWANCE));
    await setBalance(mnt(50_000));
    const once = () =>
      settle({
        workspaceId,
        userId,
        model: "openai/gpt-5-mini",
        agent: "chat.message",
        inputTokens: 20_000,
        outputTokens: 4_000,
        totalTokens: 24_000,
        requestId: `replay-${suffix}`,
      });

    const [first, second] = await Promise.all([once(), once()]);

    const { rows } = await client.query(
      `SELECT 1 FROM usage_records WHERE request_id = $1`,
      [`replay-${suffix}`]
    );
    expect(rows).toHaveLength(1);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(mnt(50_000) - (await balanceMicros())).toBe(first.charged.amount);
  });

  it("does not spend a top-up denominated in another currency", async () => {
    await setAllowanceUsed(mnt(FREE_ALLOWANCE));
    await setBalance(mnt(50_000));
    await client.query(
      `UPDATE credit_balances SET currency = 'USD' WHERE workspace_id = $1`,
      [workspaceId]
    );
    try {
      expect((await begin()).allowed).toBe(false);
    } finally {
      await client.query(
        `UPDATE credit_balances SET currency = 'MNT' WHERE workspace_id = $1`,
        [workspaceId]
      );
    }
  });

  describe("fixed prices, refunds and credits", () => {
    type Executions = ReturnType<
      typeof import("../executions").createBillingExecutions
    >;
    let billed: Executions;
    let refund: typeof import("../credit-adjustments").refundCharge;
    let credit: typeof import("../credit-adjustments").creditWorkspace;
    const price = money(mnt(1_000), "MNT");

    beforeAll(async () => {
      const { createBillingExecutions } = await import("../executions");
      billed = createBillingExecutions();
      ({ refundCharge: refund, creditWorkspace: credit } =
        await import("../credit-adjustments"));
    });

    const report = (requestId: string, user: string | null = userId) =>
      billed.begin({
        workspaceId,
        userId: user,
        capability: "report.generate",
        requestId,
        price,
      });

    async function usageRows(requestId: string) {
      const { rows } = await client.query<{
        type: string;
        charged_micros: string;
        model: string | null;
        user_id: string | null;
      }>(
        `SELECT type, charged_micros, model, user_id FROM usage_records WHERE request_id = $1`,
        [requestId]
      );
      return rows;
    }

    it("holds the price at begin and charges exactly it on complete", async () => {
      await setAllowanceUsed(mnt(FREE_ALLOWANCE));
      await setBalance(mnt(5_000));

      const run = await report(`fixed-${suffix}`);
      expect(run.allowed).toBe(true);
      expect(run.estimated).toEqual(price);
      await run.complete();

      expect(await balanceMicros()).toBe(mnt(4_000));
      expect(await usageRows(`fixed-${suffix}`)).toEqual([
        {
          type: "fixed_charge",
          charged_micros: String(mnt(1_000)),
          model: null,
          user_id: userId,
        },
      ]);
      const { rows } = await client.query<{
        status: string;
        charged_micros: string;
        price_micros: string;
      }>(
        `SELECT status, charged_micros, price_micros FROM executions WHERE request_id = $1`,
        [`fixed-${suffix}`]
      );
      expect(rows).toEqual([
        {
          status: "succeeded",
          charged_micros: String(mnt(1_000)),
          price_micros: String(mnt(1_000)),
        },
      ]);
    });

    it("charges nothing when the work fails, and releases the hold", async () => {
      await setAllowanceUsed(mnt(FREE_ALLOWANCE));
      await setBalance(mnt(5_000));

      const run = await report(`failed-${suffix}`);
      await run.fail({ error: new Error("the page did not load") });

      expect(await balanceMicros()).toBe(mnt(5_000));
      expect(await activeReservations()).toBe(0);
      expect(await usageRows(`failed-${suffix}`)).toEqual([]);
    });

    it("admits one of two that race for a balance that covers one", async () => {
      await setAllowanceUsed(mnt(FREE_ALLOWANCE));
      await setBalance(mnt(1_500));

      const [a, b] = await Promise.all([
        report(`race-a-${suffix}`),
        report(`race-b-${suffix}`),
      ]);

      expect([a.allowed, b.allowed].sort()).toEqual([false, true]);
      expect([a, b].find((r) => !r.allowed)!.code).toBe("insufficient_credits");
      await Promise.all([a, b].map((r) => r.complete()));
      expect(await balanceMicros()).toBe(mnt(500));
      expect(await activeReservations()).toBe(0);
    });

    it("settles work no user started", async () => {
      await setAllowanceUsed(mnt(FREE_ALLOWANCE));
      await setBalance(mnt(5_000));

      await (await report(`anon-${suffix}`, null)).complete();

      expect((await usageRows(`anon-${suffix}`))[0]?.user_id).toBeNull();
    });

    it("reconciles a run stuck in settling at its fixed price", async () => {
      await setAllowanceUsed(mnt(FREE_ALLOWANCE));
      await setBalance(mnt(5_000));
      const run = await report(`stuck-${suffix}`);
      // What complete() leaves when the process dies after claiming the row.
      await client.query(
        `UPDATE executions SET status = 'settling', input_tokens = 0, output_tokens = 0, total_tokens = 0 WHERE id = $1`,
        [run.id]
      );

      const result = await billed.reconcile(run.id);

      expect(result.action).toBe("settled");
      expect(await balanceMicros()).toBe(mnt(4_000));
      expect((await usageRows(`stuck-${suffix}`))[0]?.type).toBe(
        "fixed_charge"
      );
    });

    it("refunds a charge once, to the top-up, and refuses more than was charged", async () => {
      await setAllowanceUsed(mnt(FREE_ALLOWANCE));
      await setBalance(mnt(5_000));
      await (await report(`refund-${suffix}`)).complete();
      expect(await balanceMicros()).toBe(mnt(4_000));

      await expect(
        refund(workspaceId, `refund-${suffix}`, {
          reason: "too much",
          amount: money(mnt(2_000), "MNT"),
        })
      ).rejects.toMatchObject({ code: "refund_exceeds_charge" });

      const first = await refund(workspaceId, `refund-${suffix}`, {
        reason: "delivered late",
        amount: money(mnt(400), "MNT"),
        actorId: userId,
      });
      const second = await refund(workspaceId, `refund-${suffix}`, {
        reason: "delivered late",
      });

      expect(first).toMatchObject({ replayed: false });
      // One refund per charge: the second, full refund replays the first.
      expect(second).toEqual({
        credited: money(mnt(400), "MNT"),
        replayed: true,
      });
      expect(await balanceMicros()).toBe(mnt(4_400));
      expect(await usageRows(`refund:refund-${suffix}`)).toEqual([
        {
          type: "credit",
          charged_micros: String(-mnt(400)),
          model: null,
          user_id: null,
        },
      ]);
      const { rows: events } = await client.query<{ actor_id: string }>(
        `SELECT actor_id FROM audit_events WHERE action = 'billing.refund' AND resource_id = $1`,
        [`refund:refund-${suffix}`]
      );
      expect(events).toEqual([{ actor_id: userId }]);
      await expect(
        refund(workspaceId, `never-${suffix}`, { reason: "x" })
      ).rejects.toMatchObject({ code: "charge_not_found" });
    });

    it("refunds an allowance-funded charge to the top-up, leaving the allowance used", async () => {
      await setBalance(0);
      await (await report(`allowance-${suffix}`)).complete();
      const used = await allowanceUsedMicros();
      expect(used).toBe(mnt(1_000));

      await refund(workspaceId, `allowance-${suffix}`, { reason: "goodwill" });

      expect(await balanceMicros()).toBe(mnt(1_000));
      expect(await allowanceUsedMicros()).toBe(used);
    });

    it("keeps a charge and a credit apart when they share a key", async () => {
      await setAllowanceUsed(mnt(FREE_ALLOWANCE));
      await setBalance(mnt(5_000));
      await credit(workspaceId, money(mnt(100), "MNT"), {
        reason: "goodwill",
        requestId: `shared-${suffix}`,
      });

      await (await report(`shared-${suffix}`)).complete();

      expect(await balanceMicros()).toBe(mnt(4_100));
      expect(await activeReservations()).toBe(0);
    });

    it("records the model, tokens and provider cost of fixed-price work that ran on one", async () => {
      await setAllowanceUsed(mnt(FREE_ALLOWANCE));
      await setBalance(mnt(5_000));
      const run = await billed.begin({
        workspaceId,
        userId,
        capability: "report.generate",
        requestId: `modelled-${suffix}`,
        price,
        model: "openai/gpt-5-mini",
      });
      await run.complete({
        usage: { inputTokens: 100_000, outputTokens: 50_000 },
        model: "openai/gpt-5-mini",
      });

      const { rows } = await client.query<{
        type: string;
        model: string;
        total_tokens: number;
        provider_cost_micros: string;
        charged_micros: string;
      }>(
        `SELECT type, model, total_tokens, provider_cost_micros, charged_micros FROM usage_records WHERE request_id = $1`,
        [`modelled-${suffix}`]
      );
      expect(rows[0]).toMatchObject({
        type: "fixed_charge",
        model: "openai/gpt-5-mini",
        total_tokens: 150_000,
        charged_micros: String(mnt(1_000)),
      });
      expect(Number(rows[0]!.provider_cost_micros)).toBeGreaterThan(0);
    });

    it("refuses a retry under a refused attempt's id with a typed error, and holds nothing", async () => {
      await setAllowanceUsed(mnt(FREE_ALLOWANCE));
      await setBalance(0);
      expect((await report(`retry-${suffix}`)).allowed).toBe(false);
      await setBalance(mnt(5_000));

      await expect(report(`retry-${suffix}`)).rejects.toMatchObject({
        code: "request_id_taken",
      });
      expect(await activeReservations()).toBe(0);
      expect(await balanceMicros()).toBe(mnt(5_000));
    });

    it("credits once however many calls race with one key", async () => {
      await setBalance(0);

      const results = await Promise.all(
        [1, 2, 3].map(() =>
          credit(workspaceId, money(mnt(250), "MNT"), {
            reason: "promotion",
            requestId: `promo-${suffix}`,
          })
        )
      );

      expect(results.filter((r) => !r.replayed)).toHaveLength(1);
      expect(await balanceMicros()).toBe(mnt(250));
    });
  });
});
