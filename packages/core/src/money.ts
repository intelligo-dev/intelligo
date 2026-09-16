/**
 * Money, in one unit, with the currency attached.
 *
 * The framework used to denominate every amount in one deployment's
 * currency: `balance_mnt`, `chargedMnt`, `estimatedMnt`, a
 * `DEFAULT_USD_TO_MNT_RATE` constant, and a `formatPrice` that returned
 * a tugrik glyph — in the public port types of a package meant to
 * underpin products that do not sell in tugrik. This module is the
 * replacement. It imports nothing, and must keep importing nothing:
 * `@intelligo-dev/executions/pricing` is a deliberate zero-import leaf
 * that client bundles reach, and it needs these types without dragging
 * the rest of core behind them. `core/registry` holds the same line for
 * the same reason.
 *
 * Two decisions worth stating, because both look arbitrary and neither
 * is.
 *
 * **Micros, not minor units.** A typical chat turn on a cheap model
 * costs about $0.0019 of provider time, which is 0.74 cents once the
 * margin is applied. Rounding that to whole cents overcharges by more
 * than a third on every request. Six decimal places was in fact what
 * the old `× 3450` tugrik scaling bought — this keeps the precision and
 * drops the pretence that the number is a currency.
 *
 * **Currency on the amount, not in a global.** The bug this is built
 * against was a credit pack whose grant was authored in tokens and
 * spent as ledger units: 100,000 of one unit sold for $1.01 of another.
 * Nothing in the type system objected, because the number was a
 * `number`. Here the currency travels with the amount and `add` refuses
 * to mix two.
 */

declare const isoTag: unique symbol;
declare const microsTag: unique symbol;

/** An ISO-4217 alphabetic code, upper-cased and validated. */
export type CurrencyCode = string & { readonly [isoTag]: true };

/** An integer number of millionths of one major currency unit. */
export type Micros = number & { readonly [microsTag]: true };

/** An amount and the currency it is denominated in. */
export type Money = {
  readonly amount: Micros;
  readonly currency: CurrencyCode;
};

/** Thrown for every misuse in this module, so callers can catch one type. */
export class MoneyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "MoneyError";
  }
}

const MICROS_PER_UNIT = 1_000_000;

/**
 * Currencies whose minor unit is not the usual hundredth.
 *
 * Only the exceptions are listed; everything else is 2. Getting this
 * wrong is not cosmetic — it is the difference between charging ¥1,000
 * and ¥100,000, because Stripe takes zero-decimal currencies in whole
 * units and every other one in hundredths.
 */
const MINOR_EXPONENT: Readonly<Record<string, 0 | 2 | 3>> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  MGA: 0,
  MNT: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
};

/**
 * Validate and normalise an ISO-4217 code.
 *
 * Shape only — a real registry would go stale, and a deployment
 * selling in a code this file has never heard of should not be blocked
 * by a list. `minorExponent` is where an unknown code takes its
 * conservative default.
 */
export function currency(code: string): CurrencyCode {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{3}$/.test(upper)) {
    throw new MoneyError(
      "invalid_currency",
      `"${code}" is not an ISO-4217 alphabetic code (three letters).`
    );
  }
  return upper as CurrencyCode;
}

/**
 * An integer count of micros.
 *
 * The upper bound is `Number.MAX_SAFE_INTEGER`, which at six decimal
 * places is about 9 billion major units — far above any real balance,
 * and low enough to catch a value that arrived in the wrong unit.
 */
export function micros(value: number): Micros {
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      "not_an_integer",
      `Micros must be a whole number; received ${value}. Convert with fromMajor/fromMinor rather than multiplying by hand.`
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(
      "out_of_range",
      `${value} micros exceeds the safe integer range.`
    );
  }
  return value as Micros;
}

export function money(amount: number, code: string | CurrencyCode): Money {
  return { amount: micros(amount), currency: currency(code) };
}

/** How many decimal places this currency's minor unit has. */
export function minorExponent(code: CurrencyCode): 0 | 2 | 3 {
  return MINOR_EXPONENT[code] ?? 2;
}

/** `12.34` USD → `12_340_000` micros. */
export function fromMajor(value: number, code: string | CurrencyCode): Money {
  return {
    amount: micros(Math.round(value * MICROS_PER_UNIT)),
    currency: currency(code),
  };
}

/** `1234` cents → `12_340_000` micros. */
export function fromMinor(value: number, code: string | CurrencyCode): Money {
  const c = currency(code);
  const scale = MICROS_PER_UNIT / 10 ** minorExponent(c);
  return { amount: micros(Math.round(value * scale)), currency: c };
}

/**
 * The integer a payment provider wants: whole units for a zero-decimal
 * currency, hundredths for most, thousandths for a few.
 *
 * Rounds up. A fraction of a minor unit is money the deployment has
 * already spent, and rounding it away means eating the difference on
 * every transaction.
 */
export function toMinor(value: Money): number {
  const scale = MICROS_PER_UNIT / 10 ** minorExponent(value.currency);
  return Math.ceil(value.amount / scale);
}

/** The amount as a plain decimal number, for display and for charts. */
export function toMajor(value: Money): number {
  return value.amount / MICROS_PER_UNIT;
}

export const zero = (code: string | CurrencyCode): Money => ({
  amount: 0 as Micros,
  currency: currency(code),
});

function sameCurrency(a: Money, b: Money, op: string): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(
      "currency_mismatch",
      `Cannot ${op} ${a.currency} and ${b.currency}. Convert one first — an exchange rate is a decision, not a coercion.`
    );
  }
}

export function add(a: Money, b: Money): Money {
  sameCurrency(a, b, "add");
  return { amount: micros(a.amount + b.amount), currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  sameCurrency(a, b, "subtract");
  return { amount: micros(a.amount - b.amount), currency: a.currency };
}

/** Scale by a plain factor — a margin multiplier, a percentage, a count. */
export function multiply(value: Money, factor: number): Money {
  if (!Number.isFinite(factor)) {
    throw new MoneyError("invalid_factor", `Factor must be finite.`);
  }
  return {
    amount: micros(Math.ceil(value.amount * factor)),
    currency: value.currency,
  };
}

export function compare(a: Money, b: Money): number {
  sameCurrency(a, b, "compare");
  return a.amount === b.amount ? 0 : a.amount < b.amount ? -1 : 1;
}

export const isZero = (value: Money): boolean => value.amount === 0;
export const isNegative = (value: Money): boolean => value.amount < 0;

/**
 * Convert at an explicit rate, expressed in micros so the rate itself
 * carries no float error: `3_450_000_000` is 3450.0.
 *
 * There is no ambient rate and no default. A framework that guesses an
 * exchange rate is inventing money.
 */
export function convert(
  value: Money,
  to: string | CurrencyCode,
  rateMicros: number
): Money {
  const target = currency(to);
  if (!Number.isInteger(rateMicros) || rateMicros <= 0) {
    throw new MoneyError(
      "invalid_rate",
      `Rate must be a positive integer number of micros; received ${rateMicros}.`
    );
  }
  if (target === value.currency) {
    if (rateMicros !== MICROS_PER_UNIT) {
      throw new MoneyError(
        "invalid_rate",
        `Converting ${value.currency} to itself at ${rateMicros / MICROS_PER_UNIT} is not a conversion.`
      );
    }
    return value;
  }
  return {
    amount: micros(Math.ceil((value.amount * rateMicros) / MICROS_PER_UNIT)),
    currency: target,
  };
}

/** Two significant digits is enough to read a sub-cent amount by. */
const SIGNIFICANT_DIGITS = 2;

/**
 * How many decimals an amount needs to be legible.
 *
 * The currency's own minor unit, except when that would render a real
 * charge as nothing: one chat turn costs a fraction of a cent, and a
 * usage page that says every request cost `$0.00` is worse than one
 * that says `$0.0048`. Below the minor unit the amount is shown to two
 * significant digits, capped at the six decimals micros can hold.
 */
export function displayFractionDigits(value: Money): number {
  const digits = minorExponent(value.currency);
  const major = Math.abs(toMajor(value));
  // Zero, and anything that still rounds to a visible minor unit, reads
  // the way the currency is normally written.
  if (major === 0 || major >= 10 ** -digits / 2) return digits;
  const leadingZeros = Math.floor(-Math.log10(major));
  return Math.min(6, leadingZeros + SIGNIFICANT_DIGITS);
}

/**
 * Format for a human, in their locale.
 *
 * `Intl` owns the symbol, its position, the grouping separator and the
 * decimal separator — none of which belong in framework source. This
 * is the function that replaces a `₮${n.toLocaleString()}` template.
 */
export function formatMoney(
  value: Money,
  locale: string,
  options: Intl.NumberFormatOptions = {}
): string {
  const digits = displayFractionDigits(value);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: value.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    ...options,
  }).format(toMajor(value));
}
