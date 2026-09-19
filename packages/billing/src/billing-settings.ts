/**
 * Reads the singleton billing_settings row that says what a deployment
 * bills in: its currency, what one USD costs in it (micros), and the
 * margin over provider cost (basis points of a multiplier). Cached
 * in-process for 60 seconds; the DB row is authoritative.
 *
 * A deployment names its currency, rate and margin once, from its
 * composition root, through `ensureBillingSettingsRow`; until it does,
 * it bills in USD at cost × the default margin. After that the row
 * changes only through `updateBillingSettings`.
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
 * The row earlier migrations seeded into every database (tugrik at
 * 3450, 4×). Nobody chose it: a database that still holds exactly this
 * row takes the composition root's configuration instead. Any other row
 * was set on purpose and is left alone.
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
 * Wipe this process's cache so the next call re-reads the DB.
 * `updateBillingSettings` calls it; a test that writes the row itself
 * does too.
 */
export function invalidateBillingSettingsCache(): void {
  cached = null;
}

/**
 * Idempotent seeder — ensures a "default" row exists on first boot.
 * Safe to call multiple times.
 *
 * A deployment says what it bills in here, from its composition root:
 *
 *   ensureBillingSettingsRow({
 *     currency: "EUR",
 *     usdRateMicros: 920_000, // one USD costs 0.92 EUR
 *     marginBp: DEFAULT_MARGIN_BP,
 *   });
 *
 * An existing row wins — `updateBillingSettings` may have changed it,
 * and a redeploy must not undo that — except the legacy seed
 * (`LEGACY_SEED`), which nobody chose. Editing the values passed here
 * therefore changes nothing on a database that already has its row.
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

export type BillingSettingsErrorCode =
  "empty_update" | "invalid_rate" | "invalid_margin";

/** A change to the billing settings that was refused, and why. */
export class BillingSettingsError extends Error {
  constructor(
    readonly code: BillingSettingsErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BillingSettingsError";
  }
}

/** `margin_bp` is a 32-bit integer column. */
const MAX_MARGIN_BP = 2_147_483_647;

export type BillingSettingsUpdate = {
  currency?: string;
  usdRateMicros?: number;
  marginBp?: number;
};

/**
 * Change what the deployment bills in: any of its currency, what one USD
 * costs in it, and the margin. The supported way to change the row after
 * first boot — from an operator script or an admin action that has
 * already checked who is asking. Fields left out keep their value; a
 * database with no row yet gets one, the rest of it from the defaults.
 *
 * Refused, with nothing written:
 * - a currency that is not a three-letter ISO-4217 code (`MoneyError`,
 *   `invalid_currency`);
 * - a rate that is not a positive whole number of micros
 *   (`invalid_rate`) — `920_000` means one USD costs 0.92;
 * - a margin that is not a positive whole number of basis points
 *   (`invalid_margin`) — `10_000` is cost, `40_000` is 4×, and zero
 *   would read back as the default margin rather than as free;
 * - an update that names no field (`empty_update`).
 *
 * The rate and the margin price charges from now on; settled rows keep
 * what they were charged.
 *
 * CHANGING THE CURRENCY CONVERTS NOTHING. Credit balances, trial grants,
 * the current period's allowance usage and pending credit purchases stay
 * denominated in the currency they were written in, and the engine
 * refuses a write in another one rather than converting: a workspace
 * whose ledger is in the old currency is refused at admission and
 * settlement until its rows are migrated. Plan allowances and credit
 * bundles are declared in the composition root and must be restated in
 * the new currency too, and the rate has to change with it — pass both
 * in one call. On a ledger that already holds balances, convert the
 * rows first, as a deliberate operation of your own.
 *
 * This process reads the new values at once; other instances follow
 * when their cache expires, within 60 seconds.
 */
export async function updateBillingSettings(
  update: BillingSettingsUpdate
): Promise<ResolvedBillingSettings> {
  const patch: Partial<ResolvedBillingSettings> = {};

  if (update.currency !== undefined) {
    patch.currency = currency(update.currency);
  }
  if (update.usdRateMicros !== undefined) {
    if (
      !Number.isSafeInteger(update.usdRateMicros) ||
      update.usdRateMicros <= 0
    ) {
      throw new BillingSettingsError(
        "invalid_rate",
        `usdRateMicros must be a positive whole number of micros; received ${update.usdRateMicros}. One USD at 0.92 is 920_000.`
      );
    }
    patch.usdRateMicros = update.usdRateMicros;
  }
  if (update.marginBp !== undefined) {
    if (
      !Number.isInteger(update.marginBp) ||
      update.marginBp <= 0 ||
      update.marginBp > MAX_MARGIN_BP
    ) {
      throw new BillingSettingsError(
        "invalid_margin",
        `marginBp must be a positive whole number of basis points; received ${update.marginBp}. 10_000 is cost, 40_000 is 4×.`
      );
    }
    patch.marginBp = update.marginBp;
  }
  if (Object.keys(patch).length === 0) {
    throw new BillingSettingsError(
      "empty_update",
      "updateBillingSettings needs at least one of currency, usdRateMicros and marginBp."
    );
  }

  const rows = await db
    .insert(billingSettings)
    .values({ id: "default", ...DEFAULTS, ...patch })
    .onConflictDoUpdate({
      target: billingSettings.id,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning();

  invalidateBillingSettingsCache();

  const row = rows[0];
  return {
    currency: currency(row?.currency ?? patch.currency ?? DEFAULTS.currency),
    usdRateMicros: Number(
      row?.usdRateMicros ?? patch.usdRateMicros ?? DEFAULTS.usdRateMicros
    ),
    marginBp: row?.marginBp ?? patch.marginBp ?? DEFAULTS.marginBp,
  };
}
