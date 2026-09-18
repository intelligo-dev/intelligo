/**
 * What a deployment bills in is its own configuration.
 *
 * `ensureBillingSettingsRow` writes the composition root's currency,
 * rate and margin on first boot and leaves an existing row alone — an
 * admin may have edited it. The one exception is the legacy seed row
 * (tugrik at 3450, 4×): nobody chose it, so a configured deployment
 * replaces it.
 *
 * Runs against a real database when TEST_PG_URL is set (CI points it at
 * the replayed chain).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Client } from "pg";

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

d("ensureBillingSettingsRow (integration)", () => {
  const client = new Client({ connectionString: PG_URL });
  let settings: typeof import("../billing-settings");
  let saved: Record<string, unknown> | undefined;

  const EUR = { currency: "EUR", usdRateMicros: 920_000, marginBp: 30_000 };

  async function row() {
    const { rows } = await client.query<{
      currency: string;
      usd_rate_micros: string;
      margin_bp: number;
    }>(
      `SELECT currency, usd_rate_micros, margin_bp FROM billing_settings WHERE id = 'default'`
    );
    const r = rows[0];
    return r
      ? {
          currency: r.currency,
          usdRateMicros: Number(r.usd_rate_micros),
          marginBp: r.margin_bp,
        }
      : null;
  }

  beforeAll(async () => {
    await client.connect();
    const { rows } = await client.query(
      `SELECT * FROM billing_settings WHERE id = 'default'`
    );
    saved = rows[0];
    settings = await import("../billing-settings");
  });

  beforeEach(async () => {
    await client.query(`DELETE FROM billing_settings WHERE id = 'default'`);
    settings.invalidateBillingSettingsCache();
  });

  afterAll(async () => {
    await client.query(`DELETE FROM billing_settings WHERE id = 'default'`);
    if (saved) {
      await client.query(
        `INSERT INTO billing_settings (id, currency, usd_rate_micros, margin_bp) VALUES ('default', $1, $2, $3)`,
        [saved.currency, saved.usd_rate_micros, saved.margin_bp]
      );
    }
    settings.invalidateBillingSettingsCache();
    await client.end();
  });

  it("writes the configured currency on first boot", async () => {
    await settings.ensureBillingSettingsRow(EUR);
    expect(await row()).toEqual(EUR);
  });

  it("replaces the row the pre-1.0 chain seeded", async () => {
    await client.query(
      `INSERT INTO billing_settings (id, currency, usd_rate_micros, margin_bp) VALUES ('default', 'MNT', 3450000000, 40000)`
    );
    await settings.ensureBillingSettingsRow(EUR);
    expect(await row()).toEqual(EUR);
    expect((await settings.getBillingSettings()).currency).toBe("EUR");
  });

  it("leaves a row someone set on purpose alone", async () => {
    const chosen = {
      currency: "MNT",
      usdRateMicros: 3_500_000_000,
      marginBp: 35_000,
    };
    await client.query(
      `INSERT INTO billing_settings (id, currency, usd_rate_micros, margin_bp) VALUES ('default', $1, $2, $3)`,
      [chosen.currency, chosen.usdRateMicros, chosen.marginBp]
    );
    await settings.ensureBillingSettingsRow(EUR);
    expect(await row()).toEqual(chosen);
  });

  it("bills in USD at cost times the default margin when nothing is configured", async () => {
    await settings.ensureBillingSettingsRow();
    const r = await row();
    expect(r?.currency).toBe("USD");
    expect(r?.usdRateMicros).toBe(1_000_000);
  });
});
