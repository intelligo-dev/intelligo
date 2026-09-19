/**
 * billing-settings.ts — `updateBillingSettings` is the one way the row
 * changes after first boot. It writes only the fields it was given,
 * refuses values the reader would misinterpret, and drops the cache so
 * the next charge is priced on the new row.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  /** The stored row; null until something inserts one. */
  row: null as Record<string, unknown> | null,
  selects: 0,
  writes: 0,
  lastConflictSet: null as Record<string, unknown> | null,
}));

vi.mock("@intelligo-dev/core/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            state.selects += 1;
            return state.row ? [state.row] : [];
          },
        }),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => ({
          returning: async () => {
            state.writes += 1;
            state.lastConflictSet = set;
            state.row = state.row ? { ...state.row, ...set } : values;
            return [state.row];
          },
        }),
      }),
    }),
  },
}));
vi.mock("@intelligo-dev/core/db/schema", () => ({
  billingSettings: { id: "id" },
}));

import { MoneyError } from "@intelligo-dev/core/money";
import {
  BillingSettingsError,
  getBillingSettings,
  invalidateBillingSettingsCache,
  updateBillingSettings,
} from "./billing-settings";

const EUR_ROW = {
  id: "default",
  currency: "EUR",
  usdRateMicros: 920_000,
  marginBp: 30_000,
};

beforeEach(() => {
  state.row = { ...EUR_ROW };
  state.selects = 0;
  state.writes = 0;
  state.lastConflictSet = null;
  invalidateBillingSettingsCache();
});

describe("updateBillingSettings", () => {
  it("writes only the fields it was given", async () => {
    const result = await updateBillingSettings({ marginBp: 50_000 });

    expect(result).toEqual({
      currency: "EUR",
      usdRateMicros: 920_000,
      marginBp: 50_000,
    });
    expect(state.lastConflictSet).toEqual({
      marginBp: 50_000,
      updatedAt: expect.any(Date),
    });
  });

  it("changes the currency and its rate together, normalising the code", async () => {
    const result = await updateBillingSettings({
      currency: "gbp",
      usdRateMicros: 790_000,
    });

    expect(result).toEqual({
      currency: "GBP",
      usdRateMicros: 790_000,
      marginBp: 30_000,
    });
  });

  it("creates the row from the defaults when the database has none", async () => {
    state.row = null;

    const result = await updateBillingSettings({ usdRateMicros: 1_100_000 });

    expect(result).toEqual({
      currency: "USD",
      usdRateMicros: 1_100_000,
      marginBp: 40_000,
    });
    expect(state.row).toMatchObject({ id: "default", currency: "USD" });
  });

  it("invalidates the cache, so the next read sees the new row", async () => {
    expect((await getBillingSettings()).marginBp).toBe(30_000);
    expect((await getBillingSettings()).marginBp).toBe(30_000);
    expect(state.selects).toBe(1);

    await updateBillingSettings({ marginBp: 60_000 });

    expect((await getBillingSettings()).marginBp).toBe(60_000);
    expect(state.selects).toBe(2);
  });

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a rate of %s",
    async (usdRateMicros) => {
      await expect(
        updateBillingSettings({ usdRateMicros })
      ).rejects.toMatchObject({
        name: "BillingSettingsError",
        code: "invalid_rate",
      });
      expect(state.writes).toBe(0);
    }
  );

  it.each([0, -10_000, 12_345.6, Number.NaN, 2_147_483_648])(
    "refuses a margin of %s",
    async (marginBp) => {
      await expect(updateBillingSettings({ marginBp })).rejects.toMatchObject({
        code: "invalid_margin",
      });
      expect(state.writes).toBe(0);
    }
  );

  it.each(["", "EURO", "E1R", "€"])("refuses the currency %j", async (code) => {
    const error = await updateBillingSettings({ currency: code }).catch(
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(MoneyError);
    expect((error as MoneyError).code).toBe("invalid_currency");
    expect(state.writes).toBe(0);
  });

  it("refuses the whole update when one field is wrong", async () => {
    await expect(
      updateBillingSettings({ currency: "GBP", usdRateMicros: 0 })
    ).rejects.toBeInstanceOf(BillingSettingsError);
    expect(state.writes).toBe(0);
    expect(state.row).toEqual(EUR_ROW);
  });

  it("refuses an update that names nothing", async () => {
    await expect(updateBillingSettings({})).rejects.toMatchObject({
      code: "empty_update",
    });
    expect(state.writes).toBe(0);
  });
});
