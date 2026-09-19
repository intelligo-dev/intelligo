/**
 * The billing period is the UTC calendar month. A host's own time zone
 * must not move the boundary: two hosts that disagree on the period
 * start read and write different `monthly_usage` rows.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@intelligo-dev/core/db", () => ({ db: {} }));
vi.mock("@intelligo-dev/core/db/schema", () => ({ monthlyUsage: {} }));

import {
  getCurrentPeriodEnd,
  getCurrentPeriodKey,
  getCurrentPeriodStart,
} from "./quota-usage";

const originalTz = process.env.TZ;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
  vi.useRealTimers();
});

// 20:00 UTC on the last day of August: already 1 September in Kiritimati
// (UTC+14), still 31 August in Los Angeles.
const LATE_AUGUST = new Date("2026-08-31T20:00:00.000Z");
// 02:00 UTC on 1 September: still 31 August in Los Angeles.
const EARLY_SEPTEMBER = new Date("2026-09-01T02:00:00.000Z");

describe.each(["UTC", "Pacific/Kiritimati", "America/Los_Angeles"])(
  "on a host in %s",
  (zone) => {
    it("starts the period at the first UTC instant of the month", () => {
      process.env.TZ = zone;

      expect(getCurrentPeriodStart(LATE_AUGUST).toISOString()).toBe(
        "2026-08-01T00:00:00.000Z"
      );
      expect(getCurrentPeriodStart(EARLY_SEPTEMBER).toISOString()).toBe(
        "2026-09-01T00:00:00.000Z"
      );
    });

    it("ends the period at the last UTC millisecond of the month", () => {
      process.env.TZ = zone;

      expect(getCurrentPeriodEnd(LATE_AUGUST).toISOString()).toBe(
        "2026-08-31T23:59:59.999Z"
      );
      expect(getCurrentPeriodEnd(EARLY_SEPTEMBER).toISOString()).toBe(
        "2026-09-30T23:59:59.999Z"
      );
    });

    it("keys the period by its UTC year and month", () => {
      process.env.TZ = zone;

      expect(getCurrentPeriodKey(LATE_AUGUST)).toBe("2026-08");
      expect(getCurrentPeriodKey(EARLY_SEPTEMBER)).toBe("2026-09");
    });
  }
);

describe("without an argument", () => {
  it("reads the clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-15T12:00:00.000Z"));

    expect(getCurrentPeriodStart().toISOString()).toBe(
      "2027-01-01T00:00:00.000Z"
    );
    expect(getCurrentPeriodEnd().toISOString()).toBe(
      "2027-01-31T23:59:59.999Z"
    );
    expect(getCurrentPeriodKey()).toBe("2027-01");
  });

  it("rolls December into the next year", () => {
    expect(
      getCurrentPeriodEnd(new Date("2026-12-10T00:00:00.000Z")).toISOString()
    ).toBe("2026-12-31T23:59:59.999Z");
  });
});
