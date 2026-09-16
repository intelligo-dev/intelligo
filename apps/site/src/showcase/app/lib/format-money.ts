/**
 * One way to show money, wherever it is rendered.
 *
 * Amounts arrive from the framework as micros — millionths of one major
 * unit — with the currency attached, because a number that does not say
 * what it is of is how a tugrik ledger came to be printed with a dollar
 * sign. This turns one into a string through next-intl, so the symbol,
 * its position and the separators come from the reader's locale rather
 * than from a template in a component.
 *
 * Takes the formatter rather than calling a hook, so the same function
 * serves a server component (`await getFormatter()`) and a client one
 * (`useFormatter()`).
 *
 * Consumer-owned: a product that wants compact totals ("$1.2K") or a
 * different rounding rule edits this file.
 */

import type { useFormatter } from "use-intl";

/**
 * next-intl's formatter. `useFormatter()` in a client component and
 * `await getFormatter()` in a server one return the same shape, and
 * naming it this way does not depend on which type next-intl exports.
 */
type Formatter = ReturnType<typeof useFormatter>;

/** An amount in micros and the currency it is denominated in. */
export type MoneyLike = { amount: number; currency: string };

const MICROS_PER_UNIT = 1_000_000;

/** Two significant digits is enough to read a sub-cent amount by. */
const SIGNIFICANT_DIGITS = 2;

/** What `Intl` says this currency's minor unit is: 2 for USD, 0 for MNT. */
function currencyDigits(currency: string): number {
  return (
    new Intl.NumberFormat("en-US", { style: "currency", currency })
      .resolvedOptions().maximumFractionDigits ?? 2
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
 * `format` is next-intl's own formatter, from `useFormatter()` in a
 * client component or `await getFormatter()` in a server one. A product
 * that wants different options — compact totals, say — edits this file
 * rather than passing them in at every call site.
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
