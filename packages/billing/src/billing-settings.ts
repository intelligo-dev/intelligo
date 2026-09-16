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
 * currency at all, which is why a USD deployment could not use it.
 * Migration 0045 dropped both.
 */

import { db } from "@intelligo-dev/core/db";
import { billingSettings } from "@intelligo-dev/core/db/schema";
import { currency } from "@intelligo-dev/core/money";
import { eq } from "drizzle-orm";
import {
  DEFAULT_MARGIN_BP,
  type BillingRate,
} from "@intelligo-dev/executions/pricing";

export type ResolvedBillingSettings = BillingRate;

const CACHE_TTL_MS = 60 * 1000;
const MICROS_PER_UNIT = 1_000_000;

let cached: { value: ResolvedBillingSettings; expiresAt: number } | null = null;

/**
 * The rate the framework shipped with, before ADR-0015 required a
 * deployment to name its own. It survives the removal of
 * `DEFAULT_USD_TO_MNT_RATE` for one reason: an existing tugrik database
 * with no settings row must keep billing exactly as it did. Anything
 * else says so through `ensureBillingSettingsRow`.
 */
const SHIPPED_MNT_RATE_MICROS = 3_450 * MICROS_PER_UNIT;

/**
 * What a deployment gets before it configures anything: the tugrik
 * basis the framework shipped with. A USD deployment says so from its
 * composition root through `ensureBillingSettingsRow`.
 */
const DEFAULTS: ResolvedBillingSettings = {
  currency: currency("MNT"),
  usdRateMicros: SHIPPED_MNT_RATE_MICROS,
  marginBp: DEFAULT_MARGIN_BP,
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
      value = {
        currency: currency(row.currency || "MNT"),
        usdRateMicros: Number(row.usdRateMicros) || SHIPPED_MNT_RATE_MICROS,
        marginBp: row.marginBp || DEFAULT_MARGIN_BP,
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
    })
    .onConflictDoNothing({ target: billingSettings.id });
}
