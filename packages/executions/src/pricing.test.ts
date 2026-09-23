/**
 * Model registry and cost accounting. No provider SDK mocks: pricing
 * needs nothing from a provider client.
 */

import { beforeEach, describe, it, expect } from "vitest";

import {
  compare,
  currency,
  fromMajor,
  money,
  toMajor,
} from "@intelligo-dev/core/money";
import { createRegistry } from "@intelligo-dev/core/registry";

import {
  DEFAULT_MARGIN_BP,
  DEFAULT_MODELS,
  PROVIDER_CURRENCY,
  UnknownModelError,
  applyRate,
  chargeFor,
  clearModels,
  estimateWorstCaseCharge,
  getModelPricing,
  isModelRegistered,
  listModels,
  modelKind,
  providerCost,
  registerModels,
  registeredModelIds,
  type BillingRate,
  type ModelCapabilities,
  type ModelPricing,
} from "./pricing";

// Nothing self-registers: the registry is populated from a composition
// root, and these tests are one.
beforeEach(() => {
  clearModels();
  registerModels(DEFAULT_MODELS);
});

describe("the registry is open", () => {
  it("starts empty, so nothing bills against a catalogue it never chose", () => {
    clearModels();
    expect(registeredModelIds()).toEqual([]);
    expect(() => providerCost("google/gemini-2.5-flash", 1, 1)).toThrow(
      UnknownModelError
    );
  });

  it("takes a model the framework has never heard of", () => {
    // The registry is open: a product adds Bedrock, Groq, a self-hosted
    // model or a newer Claude itself.
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

    expect(
      toMajor(providerCost("bedrock/llama-4-70b", 1_000_000, 0))
    ).toBeCloseTo(0.5, 4);
  });

  it("lets a deployment override a shipped price with its own contract", () => {
    registerModels([{ ...DEFAULT_MODELS[0]!, costPerMInputTokens: 0.15 }]);
    expect(
      toMajor(providerCost("google/gemini-2.5-flash", 1_000_000, 0))
    ).toBeCloseTo(0.15, 4);
  });
});

describe("the lookups a caller reaches for", () => {
  it("reads a registered model back, and nothing for one that is not", () => {
    expect(getModelPricing("google/gemini-2.5-flash")?.displayName).toBe(
      "Gemini 2.5 Flash"
    );
    expect(getModelPricing("unknown/model")).toBeUndefined();
    expect(isModelRegistered("google/gemini-2.5-flash")).toBe(true);
    expect(isModelRegistered("unknown/model")).toBe(false);
  });

  it("lists what is registered, in registration order", () => {
    expect(listModels().map((m) => m.id)).toEqual(
      DEFAULT_MODELS.map((m) => m.id)
    );
    expect(registeredModelIds()).toEqual(DEFAULT_MODELS.map((m) => m.id));
  });

  it("stores the catalogue under the documented global key", () => {
    // The key is the contract with `createRegistry`: a second copy of
    // this module bills against the same catalogue only if both ask
    // for `executions/model-pricing`.
    const shared = createRegistry<ModelPricing>("executions/model-pricing");
    expect(shared.get("google/gemini-2.5-flash")?.provider).toBe("google");
  });

  it("denominates provider prices in the currency providers quote", () => {
    expect(PROVIDER_CURRENCY).toBe("USD");
  });
});

describe("UnknownModelError", () => {
  function thrown(run: () => unknown): UnknownModelError {
    try {
      run();
    } catch (error) {
      return error as UnknownModelError;
    }
    throw new Error("expected an UnknownModelError; nothing was thrown");
  }

  it("names the id, what is registered instead, and the way out", () => {
    // The two failures look identical from a stack trace and are
    // opposite problems: nothing was ever registered, or this one id
    // is missing from a catalogue that is otherwise there.
    clearModels();
    const unconfigured = thrown(() => providerCost("unknown/model", 1, 1));
    expect(unconfigured.name).toBe("UnknownModelError");
    expect(unconfigured.code).toBe("unknown_model");
    expect(unconfigured.message).toContain('"unknown/model"');
    expect(unconfigured.message).toContain("Registered: none");
    expect(unconfigured.message).toContain("registerModels");

    registerModels(DEFAULT_MODELS);
    const misconfigured = thrown(() => providerCost("unknown/model", 1, 1));
    expect(misconfigured.message).not.toContain("Registered: none");
    expect(misconfigured.message).toContain(
      "google/gemini-2.5-flash, google/gemini-2.5-pro"
    );
  });
});

/**
 * What the shipped catalogue claims, model by model.
 *
 * Capabilities are not decoration: a router reads them to decide which
 * model gets a web-search turn or a vision turn, so a flipped flag
 * sends work to a model that cannot do it and answers anyway. The
 * table is here rather than derived from the catalogue, because a test
 * that reads the value it is checking proves nothing.
 */
const EVERY_CAPABILITY: ModelCapabilities = {
  thinking: true,
  toolCall: true,
  vision: true,
  webSearch: true,
  codeExec: true,
};

const NO_CAPABILITY: ModelCapabilities = {
  thinking: false,
  toolCall: false,
  vision: false,
  webSearch: false,
  codeExec: false,
};

const SHIPPED_CAPABILITIES: Readonly<Record<string, ModelCapabilities>> = {
  "google/gemini-2.5-flash": EVERY_CAPABILITY,
  "google/gemini-2.5-pro": EVERY_CAPABILITY,
  // The one model in the catalogue that neither searches nor runs code.
  "openai/gpt-5-mini": {
    thinking: true,
    toolCall: true,
    vision: true,
    webSearch: false,
    codeExec: false,
  },
  "openai/gpt-5.4-mini": EVERY_CAPABILITY,
  "openai/o4-mini": EVERY_CAPABILITY,
  "anthropic/claude-sonnet-4-6": EVERY_CAPABILITY,
  // Embedding models run no turn, so they claim nothing a router reads.
  "openai/text-embedding-3-small": NO_CAPABILITY,
  "openai/text-embedding-3-large": NO_CAPABILITY,
  "google/gemini-embedding-001": NO_CAPABILITY,
};

/** Input price per million tokens of each shipped embedding model. */
const EMBEDDING_PRICES: Readonly<Record<string, number>> = {
  "openai/text-embedding-3-small": 0.02,
  "openai/text-embedding-3-large": 0.13,
  "google/gemini-embedding-001": 0.15,
};

describe("DEFAULT_MODELS", () => {
  it("ships six chat models and three embedding models", () => {
    expect(DEFAULT_MODELS.filter((m) => modelKind(m) === "chat")).toHaveLength(
      6
    );
    expect(
      DEFAULT_MODELS.filter((m) => modelKind(m) === "embedding").map(
        (m) => m.id
      )
    ).toEqual(Object.keys(EMBEDDING_PRICES));
  });

  it("names its provider and that provider's own model id", () => {
    for (const model of DEFAULT_MODELS) {
      const [provider, suffix] = model.id.split("/");
      expect(model.provider, model.id).toBe(provider);
      // The SDK id is often dated — `claude-sonnet-4-6-20260214` — but
      // it always starts with the name the registry key carries.
      expect(
        model.model.startsWith(suffix!),
        `${model.id} is sent to the provider as ${model.model}`
      ).toBe(true);
      expect(model.displayName.length, model.id).toBeGreaterThan(0);
    }
  });

  it("claims the capabilities each model actually has", () => {
    expect(Object.keys(SHIPPED_CAPABILITIES).sort()).toEqual(
      DEFAULT_MODELS.map((m) => m.id).sort()
    );
    for (const model of DEFAULT_MODELS) {
      expect(model.capabilities, model.id).toEqual(
        SHIPPED_CAPABILITIES[model.id]
      );
    }
  });

  it("prices every embedding model on input alone", () => {
    for (const model of DEFAULT_MODELS) {
      if (modelKind(model) !== "embedding") continue;
      expect(model.costPerMInputTokens, model.id).toBe(
        EMBEDDING_PRICES[model.id]
      );
      expect(model.costPerMOutputTokens, model.id).toBe(0);
      expect(model.maxOutputTokens, model.id).toBe(0);
    }
  });

  it("prices and bounds every chat model", () => {
    for (const model of DEFAULT_MODELS) {
      if (modelKind(model) !== "chat") continue;
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

describe("providerCost", () => {
  it("is exact in micros — a price per million is millionths per token", () => {
    // Flash: $0.30 in + $2.50 out per million.
    const cost = providerCost("google/gemini-2.5-flash", 1_000_000, 1_000_000);
    expect(cost).toEqual(fromMajor(2.8, "USD"));
  });

  it("prices a second model from its own contract", () => {
    // Sonnet: $3.00 in + $15.00 out per million.
    expect(
      toMajor(providerCost("anthropic/claude-sonnet-4-6", 1_000_000, 1_000_000))
    ).toBeCloseTo(18.0, 2);
  });

  it("separates input and output prices", () => {
    expect(
      toMajor(providerCost("google/gemini-2.5-flash", 1_000_000, 0))
    ).toBeCloseTo(0.3, 2);
    expect(
      toMajor(providerCost("google/gemini-2.5-flash", 0, 1_000_000))
    ).toBeCloseTo(2.5, 2);
  });

  it("costs nothing for no tokens", () => {
    expect(providerCost("google/gemini-2.5-flash", 0, 0).amount).toBe(0);
  });

  it("does not round float noise up to a micro nobody used", () => {
    // o4-mini: $1.10 in per million; 100 × 1.1 is 110.00000000000001.
    expect(providerCost("openai/o4-mini", 100, 0).amount).toBe(110);
  });

  it("keeps a real call off zero by rounding the fraction up", () => {
    expect(providerCost("google/gemini-2.5-flash", 1, 0).amount).toBe(1);
  });

  it("throws for an unregistered id rather than guessing a price", () => {
    expect(() => providerCost("unknown/model", 1, 1)).toThrow(
      UnknownModelError
    );
  });

  it("names the id and the way out", () => {
    // A price the framework does not have is a configuration error, and
    // the error has to say which id and what to call.
    expect.assertions(3);
    try {
      providerCost("unknown/model", 1, 1);
    } catch (error) {
      expect((error as UnknownModelError).code).toBe("unknown_model");
      expect((error as UnknownModelError).modelId).toBe("unknown/model");
      expect((error as Error).message).toContain("registerModels");
    }
  });
});

describe("estimateWorstCaseCharge", () => {
  const USD_RATE: BillingRate = {
    currency: currency("USD"),
    usdRateMicros: 1_000_000,
    marginBp: DEFAULT_MARGIN_BP,
  };

  it("refuses to estimate a model it cannot price", () => {
    // Admission must not invent a ceiling: a guessed one bills a turn
    // at another model's rate.
    expect(() => estimateWorstCaseCharge("unknown/model", USD_RATE)).toThrow(
      UnknownModelError
    );
  });

  it("holds only the input budget for an embedding model", () => {
    // 16K input tokens at $0.02/M is 320 micros, 4× is 1,280 micros.
    expect(
      estimateWorstCaseCharge("openai/text-embedding-3-small", USD_RATE)
    ).toEqual(money(1_280, "USD"));
    // A stray output ceiling on an embedding model is not held either.
    registerModels([
      {
        ...getModelPricing("openai/text-embedding-3-small")!,
        id: "test/embedder",
        maxOutputTokens: 8_000,
        costPerMOutputTokens: 1,
      },
    ]);
    expect(estimateWorstCaseCharge("test/embedder", USD_RATE)).toEqual(
      money(1_280, "USD")
    );
  });

  it("treats a model with no kind as a chat model", () => {
    const { kind: _kind, ...legacy } = DEFAULT_MODELS[0]!;
    expect(modelKind(legacy)).toBe("chat");
  });

  it("uses the model's own output ceiling", () => {
    registerModels([
      { ...DEFAULT_MODELS[0]!, id: "test/tiny", maxOutputTokens: 100 },
    ]);
    expect(
      compare(
        estimateWorstCaseCharge("test/tiny", USD_RATE),
        estimateWorstCaseCharge("google/gemini-2.5-flash", USD_RATE)
      )
    ).toBe(-1);
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
  // A 1,447-token turn on Flash.
  const TURN = { input: 1_100, output: 347 };

  it("applies a fractional margin without float noise", () => {
    // 110 micros × 1.1 is exactly 121, not 122.
    expect(
      chargeFor("openai/o4-mini", 100, 0, { ...USD, marginBp: 11_000 }).charged
        .amount
    ).toBe(121);
  });

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
    // A fraction of a cent, not whole dollars.
    expect(toMajor(charged)).toBeLessThan(0.01);
  });

  it("charges an MNT deployment what the tugrik math charged", () => {
    const { providerCost: cost, charged } = chargeFor(
      "google/gemini-2.5-flash",
      TURN.input,
      TURN.output,
      MNT
    );
    expect(charged.currency).toBe("MNT");
    // $0.001198 × 4 × 3450 ≈ 16.5₮, kept exact rather than rounded up to 17₮.
    expect(toMajor(charged)).toBeCloseTo(16.53, 1);
    expect(toMajor(cost)).toBeCloseTo(0.001198, 6);
  });

  it("re-applies a recorded rate to a recorded cost exactly as it charged", () => {
    const { providerCost: cost, charged } = chargeFor(
      "google/gemini-2.5-flash",
      TURN.input,
      TURN.output,
      MNT
    );
    expect(applyRate(cost, MNT)).toEqual(charged);
    expect(() => applyRate(money(10, currency("MNT")), MNT)).toThrow(
      /provider cost is USD/
    );
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

  it("yields ≥65% gross margin (1 − 1/multiplier)", () => {
    // Invariant: every paid plan clears ≥65% gross margin
    // whichever model the reader picks. A charge is always provider
    // cost × multiplier, so the multiplier is the only knob protecting
    // the floor, and dropping below 1/0.35 ≈ 2.857 breaks it silently.
    const grossMargin = 1 - 1 / (DEFAULT_MARGIN_BP / 10_000);
    expect(grossMargin).toBeGreaterThanOrEqual(0.65);
  });
});
