/**
 * Integration test for 0044_money_micros — the backfill from whole
 * tugrik to micros with a currency.
 *
 * Runs only when TEST_PG_URL is set so CI (which doesn't provision a
 * Postgres) skips cleanly. Point it at the local docker-compose
 * Postgres to run it against a real DB:
 *
 *   TEST_PG_URL=postgres://postgres:postgres@localhost:5445/intelligo \
 *     pnpm vitest run packages/core/src/db/__tests__/migration-money.int.test.ts
 *
 * Why an integration test: the conversion is SQL, and getting it wrong
 * is not a crash but a ledger that is off by a factor of a million.
 * The second thing it pins is idempotence — every backfill is guarded
 * so that re-running the file (which `intelligo migrate` may do, and
 * which an operator certainly will) cannot multiply a balance twice.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

const MIGRATION = path.join(__dirname, "..", "migrations", "0044_money_micros.sql");

d("0044_money_micros", () => {
  const client = new Client({ connectionString: PG_URL });
  const suffix = Date.now();
  const workspaceId = `money-mig-ws-${suffix}`;
  const balanceId = `money-mig-balance-${suffix}`;
  const monthlyId = `money-mig-monthly-${suffix}`;
  const trialId = `money-mig-trial-${suffix}`;

  /** The file as `intelligo migrate` applies it: statement by statement. */
  async function applyMigration(): Promise<void> {
    const statements = readFileSync(MIGRATION, "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) await client.query(statement);
  }

  async function row<T extends Record<string, unknown>>(
    sql: string,
    id: string
  ): Promise<T> {
    const { rows } = await client.query<T>(sql, [id]);
    expect(rows).toHaveLength(1);
    return rows[0]!;
  }

  beforeAll(async () => {
    await client.connect();

    // Own fixtures, keyed by timestamp: a test that reads whatever the
    // database happens to hold only passes somewhere.
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at, updated_at)
       VALUES ($1, 'Money migration IT', $2, now(), now())`,
      [workspaceId, `money-mig-${suffix}`]
    );

    // Rows as the previous release wrote them: whole tugrik, no currency.
    await client.query(
      `INSERT INTO credit_balances (id, workspace_id, balance_mnt, total_purchased_mnt, total_used_mnt, updated_at)
       VALUES ($1, $2, 1234, 5000, 3766, now())`,
      [balanceId, workspaceId]
    );
    await client.query(
      `INSERT INTO monthly_usage (id, workspace_id, period_start, period_end, tokens_used, charged_mnt, request_count, updated_at)
       VALUES ($1, $2, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 1447, 17, 1, now())`,
      [monthlyId, workspaceId]
    );
    await client.query(
      `INSERT INTO trial_credits (id, workspace_id, initial_credits_mnt, credits_used_mnt, credits_remaining_mnt, provisioned_at)
       VALUES ($1, $2, 5000, 1200, 3800, now())`,
      [trialId, workspaceId]
    );

    // The migration under test, run the way an operator runs it. Each
    // pass is 21 statements, so the hook gets its own budget.
    await applyMigration();
  }, 60_000);

  afterAll(async () => {
    await client.query(`DELETE FROM credit_balances WHERE id = $1`, [balanceId]);
    await client.query(`DELETE FROM monthly_usage WHERE id = $1`, [monthlyId]);
    await client.query(`DELETE FROM trial_credits WHERE id = $1`, [trialId]);
    await client.query(`DELETE FROM organization WHERE id = $1`, [workspaceId]);
    await client.end();
  });

  it("carries a tugrik ledger over at a million micros to the unit", async () => {
    // `pg` hands back a bigint as a string; the ledger is read through
    // drizzle's `mode: "number"`, so the comparison is on the number.
    const balance = await row<{
      balance_micros: string;
      total_purchased_micros: string;
      total_used_micros: string;
      currency: string;
    }>(
      `SELECT balance_micros, total_purchased_micros, total_used_micros, currency
       FROM credit_balances WHERE id = $1`,
      balanceId
    );
    expect(Number(balance.balance_micros)).toBe(1_234_000_000);
    expect(Number(balance.total_purchased_micros)).toBe(5_000_000_000);
    expect(Number(balance.total_used_micros)).toBe(3_766_000_000);
    expect(balance.currency).toBe("MNT");

    const monthly = await row<{ allowance_used_micros: string; currency: string }>(
      `SELECT allowance_used_micros, currency FROM monthly_usage WHERE id = $1`,
      monthlyId
    );
    expect(Number(monthly.allowance_used_micros)).toBe(17_000_000);
    expect(monthly.currency).toBe("MNT");

    const trial = await row<{
      initial_micros: string;
      used_micros: string;
      remaining_micros: string;
      currency: string;
    }>(
      `SELECT initial_micros, used_micros, remaining_micros, currency
       FROM trial_credits WHERE id = $1`,
      trialId
    );
    expect(Number(trial.initial_micros)).toBe(5_000_000_000);
    expect(Number(trial.used_micros)).toBe(1_200_000_000);
    expect(Number(trial.remaining_micros)).toBe(3_800_000_000);
    expect(trial.currency).toBe("MNT");
  });

  it("changes nothing on a second run", async () => {
    await applyMigration();

    const balance = await row<{ balance_micros: string }>(
      `SELECT balance_micros FROM credit_balances WHERE id = $1`,
      balanceId
    );
    expect(Number(balance.balance_micros)).toBe(1_234_000_000);

    const trial = await row<{ remaining_micros: string }>(
      `SELECT remaining_micros FROM trial_credits WHERE id = $1`,
      trialId
    );
    expect(Number(trial.remaining_micros)).toBe(3_800_000_000);
  }, 60_000);

  it("gives the deployment a currency, a rate and a margin", async () => {
    const { rows } = await client.query<{
      currency: string;
      usd_rate_micros: string;
      margin_bp: number;
    }>(`SELECT currency, usd_rate_micros, margin_bp FROM billing_settings`);
    for (const settings of rows) {
      expect(settings.currency).toMatch(/^[A-Z]{3}$/);
      expect(Number(settings.usd_rate_micros)).toBeGreaterThan(0);
      // 40_000 bp = 4×, the margin the old `margin_multiplier_bp` 400 meant.
      expect(settings.margin_bp).toBeGreaterThanOrEqual(10_000);
    }
  });
});
