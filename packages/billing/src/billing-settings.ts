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
 * The row used to hold a USD→MNT rate and a ×100 margin with no
 * currency at all, which is why a USD deployment could not use it. Both
 * are still read as a fallback for a database that has 0044's columns
 * but has not been written to since.
 */

import { db } from "@intelligo-dev/core/db";
import { billingSettings } from "@intelligo-dev/core/db/schema";
import { currency } from "@intelligo-dev/core/money";
import { eq } from "drizzle-orm";
import {
  DEFAULT_BILLING_MARGIN,
  DEFAULT_MARGIN_BP,
  DEFAULT_USD_TO_MNT_RATE,
  type BillingRate,
} from "@intelligo-dev/executions/pricing";

export type ResolvedBillingSettings = BillingRate & {
  /** @deprecated Read `usdRateMicros`; this is the rate as a whole number. */
  usdToMntRate: number;
  /** @deprecated Read `marginBp`; this is the margin as a multiplier. */
  marginMultiplier: number;
};

const CACHE_TTL_MS = 60 * 1000;
const MICROS_PER_UNIT = 1_000_000;

let cached: { value: ResolvedBillingSettings; expiresAt: number } | null = null;

/**
 * What a deployment gets before it configures anything: the tugrik
 * basis the framework shipped with, so an existing database keeps
 * billing exactly as it did. A USD deployment says so from its
 * composition root through `ensureBillingSettingsRow`.
 */
const DEFAULTS: ResolvedBillingSettings = {
  currency: currency("MNT"),
  usdRateMicros: DEFAULT_USD_TO_MNT_RATE * MICROS_PER_UNIT,
  marginBp: DEFAULT_MARGIN_BP,
  usdToMntRate: DEFAULT_USD_TO_MNT_RATE,
  marginMultiplier: DEFAULT_BILLING_MARGIN,
};

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
      // A row written before 0044 has the old columns only; derive the
      // new shape from them rather than falling back to the defaults,
      // which would quietly re-rate the deployment.
      const usdRateMicros =
        Number(row.usdRateMicros) || row.usdToMntRate * MICROS_PER_UNIT;
      const marginBp = row.marginBp || row.marginMultiplierBp * 100;
      value = {
        currency: currency(row.currency || "MNT"),
        usdRateMicros,
        marginBp,
        usdToMntRate: row.usdToMntRate,
        marginMultiplier: marginBp / 10_000,
      };
    }

    cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch (error) {
    console.error("[BillingSettings] DB read failed, using defaults:", error);
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
 * A deployment that bills in anything but tugrik says so here, from its
 * composition root:
 *
 *   ensureBillingSettingsRow({
 *     currency: "USD",
 *     usdRateMicros: 1_000_000, // a USD deployment converts at 1.0
 *     marginBp: DEFAULT_MARGIN_BP,
 *   });
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
      // The pre-0044 columns, kept in step until 0045 drops them.
      usdToMntRate: Math.round(resolved.usdRateMicros / MICROS_PER_UNIT),
      marginMultiplierBp: Math.round(resolved.marginBp / 100),
    })
    .onConflictDoNothing({ target: billingSettings.id });
}
