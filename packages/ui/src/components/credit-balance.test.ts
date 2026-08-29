/**
 * Credit classification.
 *
 * The interesting part of this component is not its markup but its two
 * decisions: when a balance counts as low, and what fraction of the bar
 * to fill. Both are exported so a consumer building its own UI agrees
 * with this one instead of choosing a second threshold — which is
 * exactly how a dashboard ends up saying "running low" while the chat
 * still lets you send messages.
 */

import { describe, it, expect } from "vitest";

import {
  LOW_CREDIT_THRESHOLD,
  creditLevel,
  creditPercentage,
} from "./credit-balance";

describe("creditLevel", () => {
  it("is ok well inside the allowance", () => {
    expect(creditLevel(8_000, 10_000)).toBe("ok");
  });

  it("is low exactly at the threshold, not just past it", () => {
    // Boundary chosen deliberately: a balance sitting on the line
    // should warn, because the next request crosses it.
    expect(creditLevel(10_000 * LOW_CREDIT_THRESHOLD, 10_000)).toBe("low");
  });

  it("is low below the threshold", () => {
    expect(creditLevel(500, 10_000)).toBe("low");
  });

  it("is depleted at zero and below", () => {
    expect(creditLevel(0, 10_000)).toBe("depleted");
    // Settlement can overshoot a hold; a negative balance is depleted,
    // not "low".
    expect(creditLevel(-250, 10_000)).toBe("depleted");
  });

  it("does not call a plan with no allowance perpetually low", () => {
    // A top-up-only plan has no monthly grant. Dividing by it would
    // make every balance look like 0% of nothing.
    expect(creditLevel(5_000, 0)).toBe("ok");
    expect(creditLevel(0, 0)).toBe("depleted");
  });
});

describe("creditPercentage", () => {
  it("reports the share still available", () => {
    expect(creditPercentage(2_500, 10_000)).toBe(25);
  });

  it("rounds to a whole percent", () => {
    expect(creditPercentage(3_334, 10_000)).toBe(33);
  });

  it("clamps a balance that exceeds the allowance", () => {
    // Carry-over and top-ups can put the balance above the monthly
    // grant; a bar past 100% renders as overflow.
    expect(creditPercentage(50_000, 10_000)).toBe(100);
  });

  it("clamps a negative balance to zero", () => {
    expect(creditPercentage(-1, 10_000)).toBe(0);
  });

  it("shows a full bar when there is no allowance but there is credit", () => {
    expect(creditPercentage(5_000, 0)).toBe(100);
    expect(creditPercentage(0, 0)).toBe(0);
  });
});
