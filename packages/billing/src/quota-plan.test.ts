import { beforeEach, describe, expect, it, vi } from "vitest";

const { error } = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@intelligo-dev/core/logger", () => ({
  createLogger: () => ({ error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { fromMajor, currency } from "@intelligo-dev/core/money";

import { getPlanMonthlyAllowance } from "./quota-plan";
import {
  clearProductPlans,
  registerProductPlans,
  setDefaultProductSlug,
} from "./plan-registry";

describe("getPlanMonthlyAllowance", () => {
  beforeEach(() => {
    error.mockReset();
    clearProductPlans();
    setDefaultProductSlug("quota-plan-test");
    registerProductPlans("quota-plan-test", {
      free: { monthlyAllowance: fromMajor(2, "USD") },
    } as never);
  });

  it("gives the plan's allowance in the billing currency", () => {
    expect(getPlanMonthlyAllowance("free", currency("USD"))).toEqual(
      fromMajor(2, "USD")
    );
    expect(error).not.toHaveBeenCalled();
  });

  it("gives none in another currency, and says so once", () => {
    expect(getPlanMonthlyAllowance("free", currency("MNT")).amount).toBe(0);
    getPlanMonthlyAllowance("free", currency("MNT"));
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]![1]).toMatchObject({
      allowanceCurrency: "USD",
      billingCurrency: "MNT",
    });
  });
});
