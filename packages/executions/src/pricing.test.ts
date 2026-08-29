/**
 * Model registry and cost accounting.
 *
 * Moved here with the code (ADR-0008). No provider SDK mocks: the
 * point of splitting the registry out of `@intelligo-dev/ai` is that
 * pricing needs nothing from a provider client, and a test file that
 * still had to stub three of them would say the split had not
 * happened.
 */

import { describe, it, expect } from "vitest";

import {
  MODEL_CONFIGS,
  DEFAULT_BILLING_MARGIN,
  DEFAULT_USD_TO_MNT_RATE,
  calculateCost,
  calculateChargedMnt,
  estimateWorstCaseChargedMnt,
} from "./pricing";

describe("calculateCost", () => {
  it("calculates Gemini 2.5 Flash cost correctly", () => {
    // 1M input × $0.30 + 1M output × $2.50 = $2.80
    expect(
      calculateCost("google/gemini-2.5-flash", 1_000_000, 1_000_000)
    ).toBeCloseTo(2.8, 2);
  });
  it("calculates Sonnet 4.6 cost correctly", () => {
    // 1M input × $3.00 + 1M output × $15.00 = $18.00
    expect(
      calculateCost("anthropic/claude-sonnet-4-6", 1_000_000, 1_000_000)
    ).toBeCloseTo(18.0, 2);
  });
  it("returns 0 for zero tokens", () => {
    expect(calculateCost("google/gemini-2.5-flash", 0, 0)).toBe(0);
  });
  it("falls back to max cost for unknown models", () => {
    // Unknown = $3 input + $15 output
    expect(calculateCost("unknown/model", 1_000_000, 1_000_000)).toBeCloseTo(
      18.0,
      2
    );
  });
  it("separates input and output costs", () => {
    // Only input: 1M × $0.30 = $0.30
    expect(calculateCost("google/gemini-2.5-flash", 1_000_000, 0)).toBeCloseTo(
      0.3,
      2
    );
    // Only output: 1M × $2.50 = $2.50
    expect(calculateCost("google/gemini-2.5-flash", 0, 1_000_000)).toBeCloseTo(
      2.5,
      2
    );
  });
});

describe("MODEL_CONFIGS", () => {
  it("has 6 configured models", () => {
    expect(Object.keys(MODEL_CONFIGS)).toHaveLength(6);
  });
  it("has cost fields for every model", () => {
    for (const config of Object.values(MODEL_CONFIGS)) {
      expect(config.costPerMInputTokens).toBeGreaterThan(0);
      expect(config.costPerMOutputTokens).toBeGreaterThan(0);
    }
  });
  it("has capabilities for every model", () => {
    for (const config of Object.values(MODEL_CONFIGS)) {
      expect(config.capabilities).toBeDefined();
      expect(config.capabilities.toolCall).toBe(true);
    }
  });
});

describe("calculateChargedMnt", () => {
  it("applies margin and FX to the raw cost, rounding up", () => {
    // 1M input on Flash = $0.30 raw → ×4 margin ×3450 MNT = 4140₮
    const { rawCostUsd, chargedMnt } = calculateChargedMnt(
      "google/gemini-2.5-flash",
      1_000_000,
      0
    );

    expect(rawCostUsd).toBeCloseTo(0.3, 4);
    expect(chargedMnt).toBe(4140);
  });

  it("never charges zero for a request that cost something", () => {
    // A handful of tokens is a fraction of a tugrik; rounding down
    // would make short turns free, which is how a chat loop becomes
    // an unmetered one.
    const { rawCostUsd, chargedMnt } = calculateChargedMnt(
      "google/gemini-2.5-flash",
      1,
      1
    );

    expect(rawCostUsd).toBeGreaterThan(0);
    expect(chargedMnt).toBe(1);
  });

  it("honours caller-supplied FX and margin over the defaults", () => {
    const { chargedMnt } = calculateChargedMnt(
      "google/gemini-2.5-flash",
      1_000_000,
      0,
      1,
      1
    );

    expect(chargedMnt).toBe(1); // $0.30 × 1 × 1, rounded up
  });
});

describe("estimateWorstCaseChargedMnt", () => {
  it("prices the admission ceiling above a typical settled turn", () => {
    // Admission has to refuse a request whose worst case exceeds the
    // balance, so the estimate must dominate what the turn will
    // actually be billed.
    const ceiling = estimateWorstCaseChargedMnt("google/gemini-2.5-flash");
    const typical = calculateChargedMnt(
      "google/gemini-2.5-flash",
      4_000,
      1_000
    ).chargedMnt;

    expect(ceiling).toBeGreaterThan(typical);
  });

  it("still returns a ceiling for an unregistered model", () => {
    // Unknown ids price at the worst-case Claude rate rather than
    // slipping through admission for free.
    expect(estimateWorstCaseChargedMnt("unknown/model")).toBeGreaterThan(
      estimateWorstCaseChargedMnt("google/gemini-2.5-flash")
    );
  });
});

describe("DEFAULT_BILLING_MARGIN — 65% gross margin invariant", () => {
  // Founder contract: every paid plan must clear ≥65% gross margin
  // regardless of which model the user picks. Since chargedMnt is
  // always raw_cost × multiplier × FX, the multiplier is the only
  // knob protecting the floor. Dropping below 1/0.35 ≈ 2.857 silently
  // breaks the contract — this test pins it.
  const MIN_MARGIN_FOR_65_PERCENT = 1 / 0.35; // ≈ 2.857142...

  it("multiplier stays at or above the 65% margin floor", () => {
    expect(DEFAULT_BILLING_MARGIN).toBeGreaterThanOrEqual(
      MIN_MARGIN_FOR_65_PERCENT
    );
  });

  it("yields ≥65% gross margin (1 − 1/multiplier)", () => {
    const grossMargin = 1 - 1 / DEFAULT_BILLING_MARGIN;
    expect(grossMargin).toBeGreaterThanOrEqual(0.65);
  });

  it("keeps the FX fallback a positive rate", () => {
    // A zero here would make every charge round to 1₮ and look like a
    // working meter.
    expect(DEFAULT_USD_TO_MNT_RATE).toBeGreaterThan(0);
  });
});
