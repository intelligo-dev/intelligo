/**
 * Model registry and cost accounting.
 *
 * Moved here with the code (ADR-0008). No provider SDK mocks: the
 * point of splitting the registry out of `@intelligo-dev/ai` is that
 * pricing needs nothing from a provider client, and a test file that
 * still had to stub three of them would say the split had not
 * happened.
 */

import { beforeEach, describe, it, expect } from "vitest";

import {
  compare,
  currency,
  fromMajor,
  toMajor,
} from "@intelligo-dev/core/money";

import {
  DEFAULT_MARGIN_BP,
  DEFAULT_MODELS,
  DEFAULT_BILLING_MARGIN,
  DEFAULT_USD_TO_MNT_RATE,
  UnknownModelError,
  calculateCost,
  calculateChargedMnt,
  chargeFor,
  clearModels,
  estimateWorstCaseCharge,
  estimateWorstCaseChargedMnt,
  providerCost,
  registerModels,
  registeredModelIds,
  type BillingRate,
} from "./pricing";

// Nothing self-registers: the registry is populated from a composition
// root, and these tests are one.
beforeEach(() => {
  clearModels();
  registerModels(DEFAULT_MODELS);
});

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
  it("throws for a model with no registered price", () => {
    // The old behaviour warned and priced at the worst-case Claude
    // rate, while the model resolver warned and fell back to Gemini
    // Flash: the call ran on the cheapest model and billed for the
    // most expensive, and the only symptom was a console warning.
    expect(() => calculateCost("unknown/model", 1_000_000, 1_000_000)).toThrow(
      UnknownModelError
    );
  });

  it("names the id and the way out", () => {
    try {
      calculateCost("unknown/model", 1, 1);
    } catch (error) {
      expect((error as UnknownModelError).code).toBe("unknown_model");
      expect((error as UnknownModelError).modelId).toBe("unknown/model");
      expect((error as Error).message).toContain("registerModels");
    }
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

describe("the registry is open", () => {
  it("starts empty, so nothing bills against a catalogue it never chose", () => {
    clearModels();
    expect(registeredModelIds()).toEqual([]);
    expect(() => calculateCost("google/gemini-2.5-flash", 1, 1)).toThrow(
      UnknownModelError
    );
  });

  it("takes a model the framework has never heard of", () => {
    // The whole point: a product on Bedrock, Groq, a self-hosted model
    // — or simply a newer Claude — used to need a pull request here.
    registerModels([
      {
        id: "bedrock/llama-4-70b",
        provider: "bedrock",
        model: "meta.llama4-70b-v1",
        displayName: "Llama 4 70B",
        costPerMInputTokens: 0.5,
        costPerMOutputTokens: 1.5,
        maxOutputTokens: 4_000,
        capabilities: {
          thinking: false,
          toolCall: true,
          vision: false,
          webSearch: false,
          codeExec: false,
        },
      },
    ]);

    expect(calculateCost("bedrock/llama-4-70b", 1_000_000, 0)).toBeCloseTo(
      0.5,
      4
    );
  });

  it("lets a deployment override a shipped price with its own contract", () => {
    registerModels([{ ...DEFAULT_MODELS[0]!, costPerMInputTokens: 0.15 }]);
    expect(calculateCost("google/gemini-2.5-flash", 1_000_000, 0)).toBeCloseTo(
      0.15,
      4
    );
  });
});

describe("DEFAULT_MODELS", () => {
  it("ships six models", () => {
    expect(DEFAULT_MODELS).toHaveLength(6);
  });

  it("prices and bounds every one of them", () => {
    for (const model of DEFAULT_MODELS) {
      expect(model.id, `${model.id} has no id`).toMatch(/^[a-z0-9-]+\//);
      expect(model.costPerMInputTokens).toBeGreaterThan(0);
      expect(model.costPerMOutputTokens).toBeGreaterThan(0);
      // Admission needs a ceiling; a model without one cannot be
      // refused before it spends.
      expect(model.maxOutputTokens).toBeGreaterThan(0);
      expect(model.capabilities.toolCall).toBe(true);
    }
  });

  it("has no duplicate ids", () => {
    const ids = DEFAULT_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
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

  it("refuses to estimate a model it cannot price", () => {
    // Admission must not invent a ceiling. An id with no price is a
    // configuration error, and guessing one is how the old code billed
    // Gemini turns at Claude rates.
    expect(() => estimateWorstCaseChargedMnt("unknown/model")).toThrow(
      UnknownModelError
    );
  });

  it("uses the model's own output ceiling", () => {
    registerModels([
      { ...DEFAULT_MODELS[0]!, id: "test/tiny", maxOutputTokens: 100 },
    ]);
    expect(estimateWorstCaseChargedMnt("test/tiny")).toBeLessThan(
      estimateWorstCaseChargedMnt("google/gemini-2.5-flash")
    );
  });
});

describe("providerCost", () => {
  it("is exact in micros — a price per million is millionths per token", () => {
    // Flash: $0.30 in + $2.50 out per million.
    const cost = providerCost("google/gemini-2.5-flash", 1_000_000, 1_000_000);
    expect(cost).toEqual(fromMajor(2.8, "USD"));
  });

  it("keeps a real call off zero by rounding the fraction up", () => {
    expect(providerCost("google/gemini-2.5-flash", 1, 0).amount).toBe(1);
  });

  it("throws for an unregistered id rather than guessing a price", () => {
    expect(() => providerCost("unknown/model", 1, 1)).toThrow(UnknownModelError);
  });
});

describe("chargeFor", () => {
  const USD: BillingRate = {
    currency: currency("USD"),
    usdRateMicros: 1_000_000,
    marginBp: DEFAULT_MARGIN_BP,
  };
  const MNT: BillingRate = {
    currency: currency("MNT"),
    usdRateMicros: 3_450_000_000,
    marginBp: DEFAULT_MARGIN_BP,
  };
  // The turn from the browser walkthrough: 1,447 tokens on Flash.
  const TURN = { input: 1_100, output: 347 };

  it("charges a USD deployment a fraction of a cent for one turn", () => {
    const { providerCost: cost, charged } = chargeFor(
      "google/gemini-2.5-flash",
      TURN.input,
      TURN.output,
      USD
    );
    // 1,100 × 0.3 + 347 × 2.5 = 1,197.5 → 1,198 micros of provider cost.
    expect(cost.amount).toBe(1_198);
    expect(charged.currency).toBe("USD");
    expect(toMajor(charged)).toBeCloseTo(0.004792, 6);
    // The bug this replaces: the usage page read this turn as "$15".
    expect(toMajor(charged)).toBeLessThan(0.01);
  });

  it("matches the old whole-tugrik math for an MNT deployment", () => {
    const { providerCost: cost, charged } = chargeFor(
      "google/gemini-2.5-flash",
      TURN.input,
      TURN.output,
      MNT
    );
    const old = calculateChargedMnt(
      "google/gemini-2.5-flash",
      TURN.input,
      TURN.output
    ).chargedMnt;
    expect(charged.currency).toBe("MNT");
    // The old number was this one, ceilinged to a whole tugrik.
    expect(Math.abs(toMajor(charged) - old)).toBeLessThan(1);
    expect(toMajor(cost)).toBeCloseTo(0.001198, 6);
  });

  it("refuses a USD deployment whose rate is not 1.0", () => {
    expect(() =>
      chargeFor("google/gemini-2.5-flash", 10, 10, {
        ...USD,
        usdRateMicros: 3_450_000_000,
      })
    ).toThrow(/not a conversion/);
  });

  it("estimates a ceiling above a typical turn", () => {
    const ceiling = estimateWorstCaseCharge("google/gemini-2.5-flash", USD);
    const typical = chargeFor(
      "google/gemini-2.5-flash",
      TURN.input,
      TURN.output,
      USD
    ).charged;
    expect(compare(ceiling, typical)).toBe(1);
  });
});

describe("DEFAULT_MARGIN_BP — 65% gross margin invariant", () => {
  it("keeps the floor the multiplier constant keeps", () => {
    // gross margin = 1 − 1/multiplier ≥ 0.65 → multiplier ≥ 2.857…
    expect(DEFAULT_MARGIN_BP / 10_000).toBeGreaterThanOrEqual(1 / 0.35);
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
