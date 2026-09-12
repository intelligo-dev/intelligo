/**
 * Model registry and execution cost accounting.
 *
 * This lives in `executions` rather than beside the provider clients
 * because it is not AI code: it is what an execution costs. The
 * boundary records actor, workspace, capability, usage and cost
 * (ADR-0003), and the price of a token is the last of those.
 *
 * Still a leaf: no database, no provider SDK. Its one import is
 * `@intelligo-dev/core/registry`, which is itself dependency-free, so
 * `@intelligo-dev/executions/pricing` remains something a client bundle
 * can read a display name or a price from without pulling in Drizzle.
 *
 * ## The registry is open
 *
 * It used to be a closed `as const` object of six models, with
 * `ModelId = keyof typeof`. A product that wanted Bedrock, Groq,
 * Mistral, a self-hosted model — or simply a newer Claude — could not
 * add one without a pull request to the framework, and an architecture
 * test enforced that. For a framework meant to underpin ten products
 * from one cost basis, the list cannot be the framework's to close.
 *
 * `registerModels(DEFAULT_MODELS)` from the composition root gets the
 * old behaviour back in one line. Nothing self-registers: an import
 * that populates a registry is the side effect ADR-0005 bans, and it
 * is also how a deployment ends up billing against a catalogue it
 * never chose.
 *
 * ## An unregistered id throws
 *
 * The old `calculateCost` warned and priced an unknown id at the
 * worst-case Claude rate, while the model resolver warned and fell
 * back to Gemini Flash. So the call ran on the cheapest model and
 * billed for the most expensive one, and the only symptom was a
 * console warning on a server nobody reads. Whatever that is, it is
 * not pricing. An id with no price now throws, at the point where the
 * price is needed, naming the id and what to do about it.
 */

import { createRegistry } from "@intelligo-dev/core/registry";

export type ModelCapabilities = {
  thinking: boolean;
  toolCall: boolean;
  vision: boolean;
  webSearch: boolean;
  codeExec: boolean;
};

export type ModelPricing = {
  /** Provider-prefixed id, e.g. `google/gemini-2.5-flash`. */
  id: string;
  provider: string;
  /** The id the provider's own SDK expects, which is often dated. */
  model: string;
  displayName: string;
  /** USD per million input tokens, as the provider quotes it. */
  costPerMInputTokens: number;
  /** USD per million output tokens. */
  costPerMOutputTokens: number;
  /**
   * The ceiling on streamed output used for worst-case pre-request
   * estimation. Was a separate `MODEL_OUTPUT_BUDGET` map, which is one
   * more list that could disagree with this one.
   */
  maxOutputTokens: number;
  capabilities: ModelCapabilities;
};

/**
 * A model id is now any string, because the registry is open.
 *
 * Kept as a named type for the call sites that read better with it.
 * `Record<ModelId, T>` no longer means anything — which is a useful
 * compile error in the places that used to enumerate the catalogue.
 */
export type ModelId = string;

export class UnknownModelError extends Error {
  readonly code = "unknown_model";
  readonly modelId: string;
  constructor(modelId: string, registered: readonly string[]) {
    super(
      `No price registered for model "${modelId}". ` +
        `Registered: ${registered.length > 0 ? registered.join(", ") : "none"}. ` +
        `Call registerModels(DEFAULT_MODELS) — or your own catalogue — from the composition root.`
    );
    this.name = "UnknownModelError";
    this.modelId = modelId;
  }
}

const models = createRegistry<ModelPricing>("executions/model-pricing");

/** Register (or replace) one model's price and capabilities. */
export function registerModel(pricing: ModelPricing): void {
  models.set(pricing.id, pricing);
}

export function registerModels(pricings: readonly ModelPricing[]): void {
  for (const pricing of pricings) registerModel(pricing);
}

export function getModelPricing(modelId: string): ModelPricing | undefined {
  return models.get(modelId);
}

export function isModelRegistered(modelId: string): boolean {
  return models.has(modelId);
}

export function listModels(): readonly ModelPricing[] {
  return [...models.values()];
}

export function registeredModelIds(): readonly string[] {
  return [...models.keys()];
}

/** For tests composing a fresh root. */
export function clearModels(): void {
  models.clear();
}

/**
 * The catalogue the framework ships, as data.
 *
 * Prices are the providers' published USD rates and go stale; a
 * deployment that cares about the third decimal should register its own
 * contracted rates over these.
 */
export const DEFAULT_MODELS: readonly ModelPricing[] = [
  {
    id: "google/gemini-2.5-flash",
    provider: "google",
    model: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    costPerMInputTokens: 0.3,
    costPerMOutputTokens: 2.5,
    maxOutputTokens: 8_000,
    capabilities: {
      thinking: true,
      toolCall: true,
      vision: true,
      webSearch: true,
      codeExec: true,
    },
  },
  {
    id: "google/gemini-2.5-pro",
    provider: "google",
    model: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    costPerMInputTokens: 1.25,
    costPerMOutputTokens: 10,
    maxOutputTokens: 8_000,
    capabilities: {
      thinking: true,
      toolCall: true,
      vision: true,
      webSearch: true,
      codeExec: true,
    },
  },
  {
    id: "openai/gpt-5-mini",
    provider: "openai",
    model: "gpt-5-mini",
    displayName: "GPT-5 Mini",
    costPerMInputTokens: 0.25,
    costPerMOutputTokens: 2.0,
    maxOutputTokens: 8_000,
    capabilities: {
      thinking: true,
      toolCall: true,
      vision: true,
      webSearch: false,
      codeExec: false,
    },
  },
  {
    id: "openai/gpt-5.4-mini",
    provider: "openai",
    model: "gpt-5.4-mini",
    displayName: "GPT-5.4 Mini",
    costPerMInputTokens: 0.75,
    costPerMOutputTokens: 4.5,
    maxOutputTokens: 8_000,
    capabilities: {
      thinking: true,
      toolCall: true,
      vision: true,
      webSearch: true,
      codeExec: true,
    },
  },
  {
    id: "openai/o4-mini",
    provider: "openai",
    model: "o4-mini",
    displayName: "o4-mini",
    costPerMInputTokens: 1.1,
    costPerMOutputTokens: 4.4,
    maxOutputTokens: 8_000,
    capabilities: {
      thinking: true,
      toolCall: true,
      vision: true,
      webSearch: true,
      codeExec: true,
    },
  },
  {
    id: "anthropic/claude-sonnet-4-6",
    provider: "anthropic",
    model: "claude-sonnet-4-6-20260214",
    displayName: "Claude Sonnet 4.6",
    costPerMInputTokens: 3.0,
    costPerMOutputTokens: 15.0,
    maxOutputTokens: 8_000,
    capabilities: {
      thinking: true,
      toolCall: true,
      vision: true,
      webSearch: true,
      codeExec: true,
    },
  },
];

/** The price of a model, or a loud failure naming the id. */
function requireModel(modelId: string): ModelPricing {
  const pricing = models.get(modelId);
  if (!pricing) throw new UnknownModelError(modelId, registeredModelIds());
  return pricing;
}

/**
 * Raw provider cost in USD.
 *
 * @throws {UnknownModelError} when the id has no registered price.
 */
export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const config = requireModel(modelId);
  return (
    (inputTokens / 1_000_000) * config.costPerMInputTokens +
    (outputTokens / 1_000_000) * config.costPerMOutputTokens
  );
}

/**
 * Default billing margin multiplier applied on top of raw model cost.
 * Covers infra, tool overhead, FX volatility, and profit. Tunable per
 * deploy via billing_settings.margin_multiplier; this constant is the
 * fallback when the DB value is absent.
 *
 * INVARIANT — 65% gross margin floor (founder contract):
 *   gross_margin = 1 − 1/multiplier
 *   Keeping gross_margin ≥ 0.65 means multiplier ≥ 1/0.35 ≈ 2.857. The
 *   current value of 4 yields 75%, leaving buffer above the floor for
 *   FX moves and provider price rises. `pricing.test.ts` pins it.
 */
export const DEFAULT_BILLING_MARGIN = 4;

/**
 * Default USD→MNT exchange rate fallback. Real value lives in
 * billing_settings.usd_to_mnt_rate and is read per request.
 */
export const DEFAULT_USD_TO_MNT_RATE = 3450;

export type ChargedAmount = {
  rawCostUsd: number;
  chargedMnt: number;
};

/**
 * Convert raw model cost to the user-facing charged amount.
 *
 * chargedMnt = ceil( rawCostUsd × margin × fxRate )
 *
 * The rounding is upward so micro-fractions never let a free request
 * slip through; over-billing per request is at most one unit.
 *
 * @throws {UnknownModelError} when the id has no registered price.
 */
export function calculateChargedMnt(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  fxRate: number = DEFAULT_USD_TO_MNT_RATE,
  margin: number = DEFAULT_BILLING_MARGIN
): ChargedAmount {
  const rawCostUsd = calculateCost(modelId, inputTokens, outputTokens);
  const chargedMnt = Math.ceil(rawCostUsd * margin * fxRate);
  return { rawCostUsd, chargedMnt };
}

/**
 * Worst-case cost estimate for a single chat turn against a given
 * model. Used by checkQuota to refuse requests whose ceiling cost would
 * exceed the remaining balance, before provider tokens are burnt. Uses
 * the model's own `maxOutputTokens` and a generous 16K input budget to
 * cover system prompt plus conversation history.
 *
 * @throws {UnknownModelError} when the id has no registered price.
 */
export function estimateWorstCaseChargedMnt(
  modelId: string,
  fxRate: number = DEFAULT_USD_TO_MNT_RATE,
  margin: number = DEFAULT_BILLING_MARGIN
): number {
  const outputBudget = requireModel(modelId).maxOutputTokens;
  const inputBudget = 16_000;
  return calculateChargedMnt(modelId, inputBudget, outputBudget, fxRate, margin)
    .chargedMnt;
}
