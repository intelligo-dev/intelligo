/**
 * Formats money for display. Amounts are micros (millionths of one major
 * unit) with their currency; next-intl supplies the symbol, its position
 * and the separators from the reader's locale.
 *
 * Takes the formatter rather than calling a hook, so it serves a server
 * component (`await getFormatter()`) and a client one (`useFormatter()`).
 */

import type { useFormatter } from "use-intl";

/** next-intl's formatter, from `useFormatter()` or `getFormatter()`. */
type Formatter = ReturnType<typeof useFormatter>;

/** An amount in micros and the currency it is denominated in. */
export type MoneyLike = { amount: number; currency: string };

const MICROS_PER_UNIT = 1_000_000;

/** Two significant digits is enough to read a sub-cent amount by. */
const SIGNIFICANT_DIGITS = 2;

/** What `Intl` says this currency's minor unit is: 2 for USD, 0 for MNT. */
function currencyDigits(currency: string): number {
  return (
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

/**
 * How many decimals this amount needs to be legible: the currency's
 * own, except when that would render a real charge as nothing. One chat
 * turn costs a fraction of a cent, and a usage page that says every
 * request cost $0.00 is worse than one that says $0.0048.
 */
export function moneyFractionDigits(value: MoneyLike): number {
  const digits = currencyDigits(value.currency);
  const major = Math.abs(value.amount) / MICROS_PER_UNIT;
  if (major === 0 || major >= 10 ** -digits / 2) return digits;
  const leadingZeros = Math.floor(-Math.log10(major));
  return Math.min(6, leadingZeros + SIGNIFICANT_DIGITS);
}

/**
 * Formats `value` in its own currency. To change options for every call
 * site (compact totals, say), edit this function.
 */
export function formatMoney(format: Formatter, value: MoneyLike): string {
  const digits = moneyFractionDigits(value);
  return format.number(value.amount / MICROS_PER_UNIT, {
    style: "currency",
    currency: value.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
