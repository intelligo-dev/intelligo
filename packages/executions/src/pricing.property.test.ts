/**
 * The hold ceiling, as properties: within the workload a run declares,
 * no run is charged more than the hold admission took for it, and the
 * rounding on the way there stays inside its stated bound.
 */

import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";

import { currency } from "@intelligo-dev/core/money";

import {
  DEFAULT_MODELS,
  chargeFor,
  clearModels,
  estimateWorstCaseCharge,
  modelKind,
  providerCost,
  registerModels,
  type BillingRate,
  type ModelPricing,
} from "./pricing";

// Nothing self-registers: this suite is its own composition root.
beforeAll(() => {
  clearModels();
  registerModels(DEFAULT_MODELS);
});

const chatModels = DEFAULT_MODELS.filter((p) => modelKind(p) !== "embedding");
const embeddingModels = DEFAULT_MODELS.filter(
  (p) => modelKind(p) === "embedding"
);

const chatModel = fc.constantFrom(...chatModels);
const anyModel = fc.constantFrom(...DEFAULT_MODELS);

const usdRate = fc
  .integer({ min: 10_000, max: 100_000 })
  .map((marginBp): BillingRate => ({
    currency: currency("USD"),
    usdRateMicros: 1_000_000,
    marginBp,
  }));

const foreignRate = fc
  .tuple(
    fc.constantFrom("MNT", "JPY", "EUR"),
    fc.integer({ min: 1, max: 5_000_000_000 }),
    fc.integer({ min: 10_000, max: 100_000 })
  )
  .map(([code, usdRateMicros, marginBp]): BillingRate => ({
    currency: currency(code),
    usdRateMicros,
    marginBp,
  }));

const rate = fc.oneof(usdRate, foreignRate);

/** A prompt's size, up to a long context. */
const promptTokens = fc.integer({ min: 0, max: 400_000 });
const steps = fc.integer({ min: 1, max: 20 });

/** Token counts a whole run can reach: 20 steps of a long prompt. */
const runTokens = fc.integer({ min: 0, max: 8_000_000 });

const charged = (
  model: ModelPricing,
  input: number,
  output: number,
  r: BillingRate
) => chargeFor(model.id, input, output, r).charged.amount;

describe("chargeFor", () => {
  it("never charges less for more input or more output", () => {
    fc.assert(
      fc.property(
        chatModel,
        rate,
        runTokens,
        runTokens,
        runTokens,
        runTokens,
        (model, r, input, output, moreInput, moreOutput) => {
          const base = charged(model, input, output, r);
          expect(
            charged(model, input + moreInput, output, r)
          ).toBeGreaterThanOrEqual(base);
          expect(
            charged(model, input, output + moreOutput, r)
          ).toBeGreaterThanOrEqual(base);
        }
      )
    );
  });

  it("never charges less for usage split across calls than for the same usage in one", () => {
    fc.assert(
      fc.property(
        anyModel,
        rate,
        runTokens,
        runTokens,
        runTokens,
        runTokens,
        (model, r, inA, outA, inB, outB) => {
          expect(charged(model, inA + inB, outA + outB, r)).toBeLessThanOrEqual(
            charged(model, inA, outA, r) + charged(model, inB, outB, r)
          );
        }
      )
    );
  });

  it("never charges under the exact price, and less than (margin + 1) × rate + 1 micros over it", () => {
    // Exact arithmetic in BigInt: the token price × margin × rate, as a
    // fraction over PRICE_SCALE × bp-per-multiple × micros-per-unit.
    const DENOMINATOR = 1_000_000n * 10_000n * 1_000_000n;
    fc.assert(
      fc.property(
        anyModel,
        rate,
        runTokens,
        runTokens,
        (model, r, input, output) => {
          const scaled = (price: number) =>
            BigInt(Math.round(price * 1_000_000));
          const numerator =
            (BigInt(input) * scaled(model.costPerMInputTokens) +
              BigInt(output) * scaled(model.costPerMOutputTokens)) *
            BigInt(r.marginBp) *
            BigInt(r.usdRateMicros);
          const over =
            BigInt(charged(model, input, output, r)) * DENOMINATOR - numerator;
          // ((marginBp / 1e4 + 1) × (usdRateMicros / 1e6) + 1) × DENOMINATOR
          const bound =
            BigInt(r.marginBp + 10_000) * BigInt(r.usdRateMicros) * 1_000_000n +
            DENOMINATOR;
          expect(over >= 0n).toBe(true);
          expect(over < bound).toBe(true);
        }
      )
    );
  });
});

describe("providerCost with cached input", () => {
  const cost = (
    model: ModelPricing,
    input: number,
    output: number,
    cache?: { cacheReadTokens?: number; cacheWriteTokens?: number }
  ) => providerCost(model.id, input, output, cache).amount;

  /** Input tokens and a cache split of them that may run past the input. */
  const cached = fc.tuple(runTokens, runTokens, runTokens, runTokens);

  it("prices a call that names no cache counts as it always did", () => {
    fc.assert(
      fc.property(anyModel, runTokens, runTokens, (model, input, output) => {
        expect(cost(model, input, output, {})).toBe(cost(model, input, output));
        expect(
          cost(model, input, output, {
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          })
        ).toBe(cost(model, input, output));
      })
    );
  });

  it("prices cache counts at the input rate for a model with no cache prices", () => {
    const uncached = DEFAULT_MODELS.filter(
      (m) =>
        m.costPerMCacheReadInputTokens === undefined &&
        m.costPerMCacheWriteInputTokens === undefined
    );
    fc.assert(
      fc.property(
        fc.constantFrom(...uncached),
        cached,
        (model, [input, output, read, write]) => {
          expect(
            cost(model, input, output, {
              cacheReadTokens: read,
              cacheWriteTokens: write,
            })
          ).toBe(cost(model, input, output));
        }
      )
    );
  });

  it("stays between the input priced all at the cheapest rate and all at the dearest", () => {
    fc.assert(
      fc.property(chatModel, cached, (model, [input, output, read, write]) => {
        const rates = [
          model.costPerMInputTokens,
          model.costPerMCacheReadInputTokens ?? model.costPerMInputTokens,
          model.costPerMCacheWriteInputTokens ?? model.costPerMInputTokens,
        ];
        const at = (price: number) =>
          Math.ceil(
            (input * Math.round(price * 1_000_000) +
              output * Math.round(model.costPerMOutputTokens * 1_000_000)) /
              1_000_000
          );
        const priced = cost(model, input, output, {
          cacheReadTokens: read,
          cacheWriteTokens: write,
        });
        expect(priced).toBeGreaterThanOrEqual(at(Math.min(...rates)));
        expect(priced).toBeLessThanOrEqual(at(Math.max(...rates)));
      })
    );
  });

  it("never charges more for a read than for the same tokens sent fresh", () => {
    fc.assert(
      fc.property(chatModel, cached, (model, [input, output, read]) => {
        if (
          (model.costPerMCacheReadInputTokens ?? model.costPerMInputTokens) >
          model.costPerMInputTokens
        )
          return;
        expect(
          cost(model, input, output, { cacheReadTokens: read })
        ).toBeLessThanOrEqual(cost(model, input, output));
      })
    );
  });
});

describe("estimateWorstCaseCharge", () => {
  /** A run inside its declared workload: per step, input and output. */
  const run = fc
    .tuple(chatModel, rate, promptTokens, steps)
    .chain(([model, r, prompt, stepCount]) =>
      fc.tuple(
        fc.constant(model),
        fc.constant(r),
        fc.constant(prompt),
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: prompt }),
            fc.integer({ min: 0, max: model.maxOutputTokens })
          ),
          { minLength: 1, maxLength: stepCount }
        ),
        fc.constant(stepCount)
      )
    );

  it("covers every run inside the declared workload", () => {
    fc.assert(
      fc.property(run, ([model, r, prompt, calls, stepCount]) => {
        const input = calls.reduce((sum, [i]) => sum + i, 0);
        const output = calls.reduce((sum, [, o]) => sum + o, 0);
        const hold = estimateWorstCaseCharge(model.id, r, {
          inputTokens: prompt,
          steps: stepCount,
        });
        expect(charged(model, input, output, r)).toBeLessThanOrEqual(
          hold.amount
        );
      })
    );
  });

  it("holds no less for more steps or a longer prompt", () => {
    fc.assert(
      fc.property(
        anyModel,
        rate,
        promptTokens,
        steps,
        promptTokens,
        steps,
        (model, r, prompt, stepCount, morePrompt, moreSteps) => {
          const hold = (inputTokens: number, n: number) =>
            estimateWorstCaseCharge(model.id, r, { inputTokens, steps: n })
              .amount;
          const base = hold(prompt, stepCount);
          expect(hold(prompt + morePrompt, stepCount)).toBeGreaterThanOrEqual(
            base
          );
          expect(hold(prompt, stepCount + moreSteps)).toBeGreaterThanOrEqual(
            base
          );
        }
      )
    );
  });

  it("covers a run whose input was read from or written to the prompt cache", () => {
    fc.assert(
      fc.property(
        run,
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        ([model, r, prompt, calls, stepCount], readShare, writeShare) => {
          const input = calls.reduce((sum, [i]) => sum + i, 0);
          const output = calls.reduce((sum, [, o]) => sum + o, 0);
          const cacheReadTokens = Math.floor(input * readShare);
          const cacheWriteTokens = Math.floor(
            (input - cacheReadTokens) * writeShare
          );
          const hold = estimateWorstCaseCharge(model.id, r, {
            inputTokens: prompt,
            steps: stepCount,
          });
          expect(
            chargeFor(model.id, input, output, r, {
              cacheReadTokens,
              cacheWriteTokens,
            }).charged.amount
          ).toBeLessThanOrEqual(hold.amount);
        }
      )
    );
  });

  it("holds only the input of an embedding model", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...embeddingModels),
        rate,
        promptTokens,
        steps,
        (model, r, prompt, stepCount) => {
          expect(
            estimateWorstCaseCharge(model.id, r, {
              inputTokens: prompt,
              steps: stepCount,
            }).amount
          ).toBe(charged(model, prompt * stepCount, 0, r));
        }
      )
    );
  });
});
