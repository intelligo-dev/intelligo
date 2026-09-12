import { describe, expect, it } from "vitest";

import {
  MoneyError,
  add,
  compare,
  convert,
  currency,
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
});
