/**
 * Billing Settings Helper
 *
 * Reads the singleton billing_settings row that holds the live USD→MNT
 * FX rate and margin multiplier. Cached in-process for 60 seconds so
 * every chat request doesn't issue a round-trip to Neon. The DB row is
 * authoritative and can be hot-updated without a code deploy.
 *
 * The defaults come from @intelligo/executions constants — they're used when
 * the table is empty (first boot, tests).
 */

import { db } from "@intelligo/core/db";
import { billingSettings } from "@intelligo/core/db/schema";
import { eq } from "drizzle-orm";
import {
  DEFAULT_BILLING_MARGIN,
  DEFAULT_USD_TO_MNT_RATE,
} from "@intelligo/executions/pricing";

export type ResolvedBillingSettings = {
  usdToMntRate: number;
  marginMultiplier: number;
};

const CACHE_TTL_MS = 60 * 1000;

let cached: { value: ResolvedBillingSettings; expiresAt: number } | null = null;

const DEFAULTS: ResolvedBillingSettings = {
  usdToMntRate: DEFAULT_USD_TO_MNT_RATE,
  marginMultiplier: DEFAULT_BILLING_MARGIN,
};

/**
 * Get the current billing settings (FX rate + margin).
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
    const value: ResolvedBillingSettings = row
      ? {
          usdToMntRate: row.usdToMntRate,
          // Stored as basis-points integer (×100). 400 → 4.0
          marginMultiplier: row.marginMultiplierBp / 100,
        }
      : DEFAULTS;

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
 */
export async function ensureBillingSettingsRow(): Promise<void> {
  await db
    .insert(billingSettings)
    .values({
      id: "default",
      usdToMntRate: DEFAULT_USD_TO_MNT_RATE,
      marginMultiplierBp: DEFAULT_BILLING_MARGIN * 100,
    })
    .onConflictDoNothing({ target: billingSettings.id });
}
