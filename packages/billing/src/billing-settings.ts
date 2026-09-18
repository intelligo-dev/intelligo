/**
 * Billing Settings Helper
 *
 * Reads the singleton billing_settings row that says what a deployment
 * bills in: its currency, what one USD costs in it (micros), and the
 * margin over provider cost (basis points of a multiplier). Cached
 * in-process for 60 seconds so every chat request doesn't issue a
 * round-trip to Neon. The DB row is authoritative and can be
 * hot-updated without a code deploy.
 *
 * A deployment names its currency, rate and margin once, from its
 * composition root, through `ensureBillingSettingsRow`; until it does,
 * it bills in USD at cost × the default margin.
 */

import { db } from "@intelligo-dev/core/db";
import { billingSettings } from "@intelligo-dev/core/db/schema";
import { currency } from "@intelligo-dev/core/money";
import { and, eq } from "drizzle-orm";
import {
  DEFAULT_MARGIN_BP,
  type BillingRate,
} from "@intelligo-dev/executions/pricing";

export type ResolvedBillingSettings = BillingRate;

const CACHE_TTL_MS = 60 * 1000;
const MICROS_PER_UNIT = 1_000_000;

let cached: { value: ResolvedBillingSettings; expiresAt: number } | null = null;

/** One USD in USD. */
const USD_RATE_MICROS = MICROS_PER_UNIT;

/**
 * What a deployment gets before it configures anything: USD at cost
 * times the default margin. Any other currency says so from the
 * composition root through `ensureBillingSettingsRow`.
 */
const DEFAULTS: ResolvedBillingSettings = {
  currency: currency("USD"),
  usdRateMicros: USD_RATE_MICROS,
  marginBp: DEFAULT_MARGIN_BP,
};

/**
 * The row the framework's old migration chain seeded into every
 * database (tugrik at 3450, 4×). Nobody chose it: a database that still
 * holds exactly this row takes the composition root's configuration
 * instead. Any other row was set on purpose and is left alone.
 */
const LEGACY_SEED = {
  currency: "MNT",
  usdRateMicros: 3_450_000_000,
  marginBp: 40_000,
} as const;

/**
 * Get the current billing settings (currency, rate + margin).
 * Returns cached value when within TTL; otherwise re-reads the DB row
 * with id="default" and refreshes the cache. Failures fall through to
 * the in-memory default so a transient DB outage never blocks billing.
 */
export async function getBillingSettings(): Promise<ResolvedBillingSettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const rows = await db
      .select()
      .from(billingSettings)
      .where(eq(billingSettings.id, "default"))
      .limit(1);

    const row = rows[0];
    let value = DEFAULTS;
    if (row) {
      value = {
        currency: currency(row.currency || DEFAULTS.currency),
        usdRateMicros: Number(row.usdRateMicros) || USD_RATE_MICROS,
        marginBp: row.marginBp || DEFAULT_MARGIN_BP,
      };
    }

    cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch (error) {
    // Never block billing on a transient outage — and never silently
    // change what a deployment bills in either. An expired reading of
    // the real row is still right about the currency; DEFAULTS is USD,
    // so on a deployment in any other currency falling back to it
    // would charge every turn at the wrong rate until the database
    // came back.
    console.error("[BillingSettings] DB read failed:", error);
    if (cached) return cached.value;
    return DEFAULTS;
  }
}

/**
 * Test/admin helper to wipe the cache so the next call re-reads the DB.
 * Called from the admin dashboard after editing the row.
 */
export function invalidateBillingSettingsCache(): void {
  cached = null;
}

/**
 * Idempotent seeder — ensures a "default" row exists on first boot so
 * later UPDATE-from-admin can target it. Safe to call multiple times.
 *
 * A deployment says what it bills in here, from its composition root:
 *
 *   ensureBillingSettingsRow({
 *     currency: "EUR",
 *     usdRateMicros: 920_000, // one USD costs 0.92 EUR
 *     marginBp: DEFAULT_MARGIN_BP,
 *   });
 *
 * An existing row wins — an admin may have edited it — except the one
 * the old migration chain seeded, which nobody chose (`LEGACY_SEED`).
 */
export async function ensureBillingSettingsRow(config?: {
  currency: string;
  usdRateMicros: number;
  marginBp: number;
}): Promise<void> {
  const resolved = config
    ? {
        currency: currency(config.currency),
        usdRateMicros: config.usdRateMicros,
        marginBp: config.marginBp,
      }
    : DEFAULTS;

  await db
    .insert(billingSettings)
    .values({
      id: "default",
      currency: resolved.currency,
      usdRateMicros: resolved.usdRateMicros,
      marginBp: resolved.marginBp,
    })
    .onConflictDoNothing({ target: billingSettings.id });

  if (!config) return;
  const updated = await db
    .update(billingSettings)
    .set({
      currency: resolved.currency,
      usdRateMicros: resolved.usdRateMicros,
      marginBp: resolved.marginBp,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(billingSettings.id, "default"),
        eq(billingSettings.currency, LEGACY_SEED.currency),
        eq(billingSettings.usdRateMicros, LEGACY_SEED.usdRateMicros),
        eq(billingSettings.marginBp, LEGACY_SEED.marginBp)
      )
    )
    .returning({ id: billingSettings.id });
  if (updated.length > 0) invalidateBillingSettingsCache();
}
