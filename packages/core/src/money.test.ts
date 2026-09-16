import { describe, expect, it } from "vitest";

import {
  MoneyError,
  add,
  compare,
  convert,
  currency,
  displayFractionDigits,
  formatMoney,
  fromMajor,
  fromMinor,
  isNegative,
  isZero,
  micros,
  minorExponent,
  money,
  multiply,
  subtract,
  toMajor,
  toMinor,
  zero,
} from "./money";

describe("currency", () => {
  it("normalises case", () => {
    expect(currency("usd")).toBe("USD");
  });

  it("rejects anything that is not three letters", () => {
    for (const bad of ["US", "USDD", "US1", "", "$"]) {
      expect(() => currency(bad)).toThrow(MoneyError);
    }
  });

  it("knows the minor unit of the currencies that are not hundredths", () => {
    // Getting this wrong charges ¥100,000 for a ¥1,000 item.
    expect(minorExponent(currency("JPY"))).toBe(0);
    expect(minorExponent(currency("MNT"))).toBe(0);
    expect(minorExponent(currency("KWD"))).toBe(3);
    expect(minorExponent(currency("USD"))).toBe(2);
  });

  it("assumes hundredths for a code it has never heard of", () => {
    expect(minorExponent(currency("XYZ"))).toBe(2);
  });
});

describe("micros", () => {
  it("refuses a fraction", () => {
    expect(() => micros(1.5)).toThrow(/whole number/);
  });

  it("refuses a value past the safe integer range", () => {
    expect(() => micros(Number.MAX_SAFE_INTEGER + 2)).toThrow(/safe integer/);
  });
});

describe("conversion to and from the units a system actually uses", () => {
  it("round-trips major units", () => {
    expect(toMajor(fromMajor(12.34, "USD"))).toBeCloseTo(12.34, 10);
  });

  it("keeps sub-cent precision that whole cents would destroy", () => {
    // The reason micros exist: a turn costing $0.00185 of provider time
    // is 0.74¢ at a 4× margin. In whole cents that is a 35% error.
    const raw = fromMajor(0.00185, "USD");
    const charged = multiply(raw, 4);
    expect(charged.amount).toBe(7400);
    expect(toMajor(charged)).toBeCloseTo(0.0074, 10);
  });

  it("scales minor units by the currency's own exponent", () => {
    expect(fromMinor(1234, "USD").amount).toBe(12_340_000);
    expect(fromMinor(1000, "JPY").amount).toBe(1_000_000_000);
    expect(fromMinor(1234, "KWD").amount).toBe(1_234_000);
  });

  it("gives a payment provider a whole minor unit", () => {
    expect(toMinor(fromMajor(12.34, "USD"))).toBe(1234);
    expect(toMinor(fromMajor(1000, "JPY"))).toBe(1000);
    expect(toMinor(fromMajor(1.234, "KWD"))).toBe(1234);
  });

  it("rounds a partial minor unit up, never away", () => {
    // Down would mean eating the fraction on every transaction.
    expect(toMinor(money(12_345_001, "USD"))).toBe(1235);
    expect(toMinor(money(1, "USD"))).toBe(1);
    expect(toMinor(money(1, "JPY"))).toBe(1);
  });
});

describe("arithmetic", () => {
  it("adds and subtracts within one currency", () => {
    const a = fromMajor(10, "USD");
    const b = fromMajor(2.5, "USD");
    expect(toMajor(add(a, b))).toBe(12.5);
    expect(toMajor(subtract(a, b))).toBe(7.5);
  });

  it("refuses to mix currencies", () => {
    // This is the whole point of carrying the currency: the credit pack
    // that granted 100,000 of one unit for $1.01 of another type-checked.
    const usd = fromMajor(1.01, "USD");
    const mnt = fromMajor(100_000, "MNT");
    expect(() => add(usd, mnt)).toThrow(/Cannot add USD and MNT/);
    expect(() => subtract(usd, mnt)).toThrow(MoneyError);
    expect(() => compare(usd, mnt)).toThrow(MoneyError);
  });

  it("scales by a factor and rounds up", () => {
    expect(multiply(money(1000, "USD"), 2.5).amount).toBe(2500);
    expect(multiply(money(3, "USD"), 0.5).amount).toBe(2);
  });

  it("orders and inspects", () => {
    const a = fromMajor(1, "USD");
    const b = fromMajor(2, "USD");
    expect(compare(a, b)).toBe(-1);
    expect(compare(b, a)).toBe(1);
    expect(compare(a, a)).toBe(0);
    expect(isZero(zero("USD"))).toBe(true);
    expect(isNegative(subtract(a, b))).toBe(true);
  });
});

describe("convert", () => {
  it("applies an explicit rate", () => {
    // 3450.0 expressed in micros, so the rate carries no float error.
    const usd = fromMajor(1, "USD");
    const mnt = convert(usd, "MNT", 3_450_000_000);
    expect(mnt.currency).toBe("MNT");
    expect(toMajor(mnt)).toBe(3450);
  });

  it("refuses a rate that is not a positive integer of micros", () => {
    const usd = fromMajor(1, "USD");
    expect(() => convert(usd, "MNT", 3450)).not.toThrow(); // 0.00345, odd but explicit
    expect(() => convert(usd, "MNT", 0)).toThrow(/positive integer/);
    expect(() => convert(usd, "MNT", -1)).toThrow(/positive integer/);
    expect(() => convert(usd, "MNT", 1.5)).toThrow(/positive integer/);
  });

  it("treats a self-conversion at any rate but 1.0 as a mistake", () => {
    const usd = fromMajor(1, "USD");
    expect(convert(usd, "USD", 1_000_000)).toEqual(usd);
    expect(() => convert(usd, "USD", 2_000_000)).toThrow(/not a conversion/);
  });
});

describe("formatMoney", () => {
  it("uses the locale's own conventions, not a hardcoded symbol", () => {
    const usd = fromMajor(1234.5, "USD");
    expect(formatMoney(usd, "en-US")).toBe("$1,234.50");
    // A locale that puts the symbol last and groups differently.
    expect(formatMoney(usd, "de-DE")).toContain("$");
    expect(formatMoney(usd, "de-DE")).toMatch(/1\.234,50/);
  });

  it("shows no decimals for a zero-decimal currency", () => {
    expect(formatMoney(fromMajor(3450, "MNT"), "en-US")).not.toMatch(/\./);
    expect(formatMoney(fromMajor(1000, "JPY"), "ja-JP")).toBe("￥1,000");
  });

  it("shows a sub-cent charge instead of rounding it to nothing", () => {
    // What one chat turn costs. "$0.00" on a usage page is a bug report.
    expect(formatMoney(fromMajor(0.0048, "USD"), "en-US")).toBe("$0.0048");
    expect(formatMoney(money(1, "USD"), "en-US")).toBe("$0.000001");
  });

  it("lets the caller override the digits", () => {
    expect(
      formatMoney(fromMajor(0.0048, "USD"), "en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    ).toBe("$0.00");
  });
});

describe("displayFractionDigits", () => {
  it("uses the currency's own minor unit when the amount is visible there", () => {
    expect(displayFractionDigits(fromMajor(12.34, "USD"))).toBe(2);
    expect(displayFractionDigits(fromMajor(0.0074, "USD"))).toBe(2); // rounds to 1¢
    expect(displayFractionDigits(zero("USD"))).toBe(2);
    expect(displayFractionDigits(fromMajor(17, "MNT"))).toBe(0);
    expect(displayFractionDigits(fromMajor(0, "JPY"))).toBe(0);
  });

  it("grows to two significant digits below the minor unit", () => {
    expect(displayFractionDigits(fromMajor(0.0048, "USD"))).toBe(4);
    expect(displayFractionDigits(fromMajor(0.00012, "USD"))).toBe(5);
    expect(displayFractionDigits(fromMajor(0.4, "MNT"))).toBe(2);
  });

  it("caps at the six decimals micros can hold", () => {
    expect(displayFractionDigits(money(1, "USD"))).toBe(6);
  });

  it("reads a negative amount by its magnitude", () => {
    expect(displayFractionDigits(fromMajor(-0.0048, "USD"))).toBe(4);
  });

  it("counts an amount that rounds up to a visible minor unit as visible", () => {
    // The boundary is inclusive: half a cent renders as $0.01, so it
    // reads in cents. A hair under it does not, and grows digits.
    expect(displayFractionDigits(money(5_000, "USD"))).toBe(2);
    expect(displayFractionDigits(money(4_999, "USD"))).toBe(4);
  });
});

describe("inspection", () => {
  it("is false for the amounts it is not describing", () => {
    expect(isZero(fromMajor(1, "USD"))).toBe(false);
    expect(isNegative(zero("USD"))).toBe(false);
    expect(isNegative(fromMajor(1, "USD"))).toBe(false);
  });
});

/** The error a call threw, so a test can read its code and its message. */
function thrown(run: () => unknown): MoneyError {
  try {
    run();
  } catch (error) {
    return error as MoneyError;
  }
  throw new Error("expected a MoneyError; nothing was thrown");
}

describe("the errors themselves", () => {
  // A framework's error is an API: a caller branches on `code`, and a
  // developer at 2am reads `message`. Both are pinned here, because
  // both are what a misuse of this module actually looks like.

  it("carries one catchable name", () => {
    expect(thrown(() => currency("nope")).name).toBe("MoneyError");
    expect(thrown(() => currency("nope"))).toBeInstanceOf(MoneyError);
  });

  it("codes the malformed inputs, and says what it received", () => {
    const badCode = thrown(() => currency("nope"));
    expect(badCode.code).toBe("invalid_currency");
    expect(badCode.message).toContain("ISO-4217");
    expect(badCode.message).toContain("nope");

    expect(thrown(() => micros(1.5)).code).toBe("not_an_integer");
    expect(thrown(() => micros(Number.MAX_SAFE_INTEGER + 2)).code).toBe(
      "out_of_range"
    );
  });

  it("names both currencies and the operation that refused them", () => {
    const usd = fromMajor(1, "USD");
    const mnt = fromMajor(1, "MNT");

    const added = thrown(() => add(usd, mnt));
    expect(added.code).toBe("currency_mismatch");
    expect(added.message).toContain("Cannot add USD and MNT");
    expect(thrown(() => subtract(usd, mnt)).message).toContain(
      "Cannot subtract USD and MNT"
    );
    expect(thrown(() => compare(usd, mnt)).message).toContain(
      "Cannot compare USD and MNT"
    );
  });

  it("refuses a factor that is not finite", () => {
    // Infinity and NaN both reach Math.ceil without complaint; the
    // amount they produce is not a number anybody can charge.
    const infinite = thrown(() =>
      multiply(money(1000, "USD"), Number.POSITIVE_INFINITY)
    );
    expect(infinite.code).toBe("invalid_factor");
    expect(infinite.message).toContain("finite");
    expect(thrown(() => multiply(money(1000, "USD"), Number.NaN)).code).toBe(
      "invalid_factor"
    );
  });

  it("codes both rate refusals, and prints the rate as the decimal it is", () => {
    const usd = fromMajor(1, "USD");
    expect(thrown(() => convert(usd, "MNT", 0)).code).toBe("invalid_rate");

    const self = thrown(() => convert(usd, "USD", 2_000_000));
    expect(self.code).toBe("invalid_rate");
    // 2_000_000 micros is a rate of 2.0 — the message says so in the
    // unit the caller thinks in, not in micros.
    expect(self.message).toContain("at 2 is not a conversion");
  });
});
