/**
 * Model registry and execution cost accounting.
 *
 * This lives in `executions` rather than beside the provider clients
 * because it is not AI code: it is what an execution costs. The
 * boundary records actor, workspace, capability, usage and cost
 * (ADR-0003), and the price of a token is the last of those.
 *
 * Deliberately a leaf module — no database, no provider SDK, no
 * imports at all — and reachable as `@intelligo-dev/executions/pricing`
 * so a client bundle can read a display name or a price without
 * pulling in Drizzle. `@intelligo-dev/ai` re-exports it, so the ids that
 * pick a provider and the ids that carry a price stay one list; two
 * lists is how a model runs on Gemini and bills at Claude rates.
 */

/**
 * Model configuration with display information and cost tracking
 *
 * 6 models, 3 providers: Google (2), OpenAI (3), Anthropic (1)
 */
export const MODEL_CONFIGS = {
  // Google Gemini
  "google/gemini-2.5-flash": {
    provider: "google",
    model: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    costPerMInputTokens: 0.3,
    costPerMOutputTokens: 2.5,
    capabilities: {
      thinking: true,
      toolCall: true,
      vision: true,
      webSearch: true,
      codeExec: true,
    },
  },
  "google/gemini-2.5-pro": {
    provider: "google",
    model: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    costPerMInputTokens: 1.25,
    costPerMOutputTokens: 10,
    capabilities: {
      thinking: true,
      toolCall: true,
      vision: true,
      webSearch: true,
      codeExec: true,
    },
  },
  // OpenAI
  "openai/gpt-5-mini": {
    provider: "openai",
    model: "gpt-5-mini",
    displayName: "GPT-5 Mini",
    costPerMInputTokens: 0.25,
    costPerMOutputTokens: 2.0,
    capabilities: {
      thinking: true,
      toolCall: true,
      vision: true,
      webSearch: false,
      codeExec: false,
    },
  },
  "openai/gpt-5.4-mini": {
    provider: "openai",
    model: "gpt-5.4-mini",
    displayName: "GPT-5.4 Mini",
    costPerMInputTokens: 0.75,
    costPerMOutputTokens: 4.5,
    capabilities: {
      thinking: true,
      toolCall: true,
      vision: true,
      webSearch: true,
      codeExec: true,
    },
  },
  "openai/o4-mini": {
    provider: "openai",
    model: "o4-mini",
    displayName: "o4-mini",
    costPerMInputTokens: 1.1,
    costPerMOutputTokens: 4.4,
    capabilities: {
      thinking: true,
      toolCall: true,
      vision: true,
      webSearch: true,
      codeExec: true,
    },
  },
  // Anthropic
  "anthropic/claude-sonnet-4-6": {
    provider: "anthropic",
    model: "claude-sonnet-4-6-20260214",
    displayName: "Claude Sonnet 4.6",
    costPerMInputTokens: 3.0,
    costPerMOutputTokens: 15.0,
    capabilities: {
      thinking: true,
      toolCall: true,
      vision: true,
      webSearch: true,
      codeExec: true,
    },
  },
} as const;

export type ModelId = keyof typeof MODEL_CONFIGS;

/**
 * Calculate the dollar cost for a given model and token counts.
 */
export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const config = MODEL_CONFIGS[modelId as ModelId];
  if (!config) {
    // Loud fallback: an unknown model ID means somewhere upstream is
    // shipping a stale string that doesn't match MODEL_CONFIGS. We
    // price it at the highest known rate so we don't accidentally give
    // away expensive completions for free, but the warning here is the
    // contract — silent fallback is how we ended up over-billing every
    // free Gemini turn at Claude prices.
    console.warn(
      `[calculateCost] Unknown model "${modelId}" — pricing at worst-case Claude rate ($3/$15 per M). Add it to MODEL_CONFIGS.`
    );
    return (inputTokens / 1_000_000) * 3.0 + (outputTokens / 1_000_000) * 15.0;
  }
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
 *   We must keep gross_margin ≥ 0.65 across every model in MODEL_CONFIGS,
 *   which means multiplier ≥ 1/0.35 ≈ 2.857. The current value of 4
 *   yields 75%, leaving comfortable buffer above the floor for FX moves
 *   and unexpected provider price hikes. The Vitest assertion in
 *   models.test.ts pins this — drop below 2.857 at your own risk.
 */
export const DEFAULT_BILLING_MARGIN = 4;

/**
 * Default USD→MNT exchange rate fallback. Real value lives in
 * billing_settings.usd_to_mnt_rate and is read per request.
 */
export const DEFAULT_USD_TO_MNT_RATE = 3450;

/**
 * Per-model maximum output budget used for worst-case pre-request cost
 * estimation in checkQuota. Numbers are conservative — cap on streamed
 * output tokens we'd actually let a single chat turn produce.
 */
export const MODEL_OUTPUT_BUDGET: Record<ModelId, number> = {
  "google/gemini-2.5-flash": 8_000,
  "google/gemini-2.5-pro": 8_000,
  "openai/gpt-5-mini": 8_000,
  "openai/gpt-5.4-mini": 8_000,
  "openai/o4-mini": 8_000,
  "anthropic/claude-sonnet-4-6": 8_000,
};

export type ChargedAmount = {
  rawCostUsd: number;
  chargedMnt: number;
};

/**
 * Convert raw model cost to MNT user-facing charged amount.
 *
 * chargedMnt = ceil( rawCostUsd × margin × fxRate )
 *
 * The rounding is upward so micro-fractions never let a free request
 * slip through; over-billing per request is at most 1 MNT.
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
 * Worst-case MNT cost estimate for a single chat turn against a given
 * model. Used by checkQuota to refuse requests whose ceiling cost would
 * exceed remaining balance, before we burn provider tokens. Uses the
 * full MODEL_OUTPUT_BUDGET as the output side and a generous 16K input
 * budget to cover system prompt + conversation history.
 */
export function estimateWorstCaseChargedMnt(
  modelId: string,
  fxRate: number = DEFAULT_USD_TO_MNT_RATE,
  margin: number = DEFAULT_BILLING_MARGIN
): number {
  const outputBudget = MODEL_OUTPUT_BUDGET[modelId as ModelId] ?? 8_000;
  const inputBudget = 16_000;
  return calculateChargedMnt(modelId, inputBudget, outputBudget, fxRate, margin)
    .chargedMnt;
}
