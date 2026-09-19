/**
 * Token usage, in the one shape the execution boundary settles.
 */

export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

/** The three fields settlement reads, and nothing else a provider adds. */
export function pickUsage(usage: TokenUsage | undefined): TokenUsage {
  return {
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
  };
}

/**
 * Whole-run usage from the steps that completed before an abort. A
 * step still in flight is missed — under-counting by at most one step
 * beats charging nothing and leaving the hold to expire.
 */
export function sumStepUsage(
  steps: ReadonlyArray<{ usage?: TokenUsage }>
): TokenUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const step of steps) {
    inputTokens += step.usage?.inputTokens ?? 0;
    outputTokens += step.usage?.outputTokens ?? 0;
  }
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

/** The sum of two usages; a total a provider omitted is input plus output. */
export function sumUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  const total = (u: TokenUsage) =>
    u.totalTokens ?? (u.inputTokens ?? 0) + (u.outputTokens ?? 0);
  return {
    inputTokens: (a.inputTokens ?? 0) + (b.inputTokens ?? 0),
    outputTokens: (a.outputTokens ?? 0) + (b.outputTokens ?? 0),
    totalTokens: total(a) + total(b),
  };
}
