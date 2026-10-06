/**
 * Token usage, in the one shape the execution boundary settles.
 */

import { estimateTokenCount } from "./windowing";

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
 * Whole-run usage from the steps that completed before an abort. A step
 * still in flight is not among them; `abortedUsage` adds it.
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

/**
 * The usage of a run stopped mid-stream: the steps that completed, plus
 * an estimate for the step in flight, which the provider bills although
 * it never reports it. That step read the conversation (for the first
 * step, `promptTokens`) or the previous step's prompt and output, and
 * wrote `streamedTokens`. With no step in flight — stopped while a tool
 * ran — only the completed steps count.
 */
export function abortedUsage(
  steps: ReadonlyArray<{ usage?: TokenUsage }>,
  inFlight: { promptTokens: number; streamedTokens: number } | null
): TokenUsage {
  const done = sumStepUsage(steps);
  if (!inFlight) return done;
  const previous = steps[steps.length - 1]?.usage;
  const inputTokens = previous
    ? (previous.inputTokens ?? 0) + (previous.outputTokens ?? 0)
    : inFlight.promptTokens;
  return sumUsage(done, {
    inputTokens,
    outputTokens: inFlight.streamedTokens,
  });
}

/**
 * Follows the step a run is in, for `abortedUsage`: wire its three
 * callbacks into `streamText`, and on abort settle `aborted(steps)`.
 * `promptTokens` estimates what the first step reads.
 */
export function inFlightTracker(promptTokens: number) {
  let streamed: string | null = null;
  return {
    onStepStart: () => {
      streamed = "";
    },
    onChunk: ({ chunk }: { chunk: { type: string; text?: string } }) => {
      if (
        streamed !== null &&
        (chunk.type === "text-delta" || chunk.type === "reasoning-delta")
      ) {
        streamed += chunk.text ?? "";
      }
    },
    onStepFinish: () => {
      streamed = null;
    },
    aborted: (steps: ReadonlyArray<{ usage?: TokenUsage }>) =>
      abortedUsage(
        steps,
        streamed === null
          ? null
          : { promptTokens, streamedTokens: estimateTokenCount(streamed) }
      ),
  };
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
