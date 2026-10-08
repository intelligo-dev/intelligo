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
  return sumUsage(done, inFlightStepUsage(steps, inFlight));
}

/** The estimate `abortedUsage` adds for the step in flight. */
function inFlightStepUsage(
  steps: ReadonlyArray<{ usage?: TokenUsage }>,
  inFlight: { promptTokens: number; streamedTokens: number }
): TokenUsage {
  const previous = steps[steps.length - 1]?.usage;
  const inputTokens = previous
    ? (previous.inputTokens ?? 0) + (previous.outputTokens ?? 0)
    : inFlight.promptTokens;
  const outputTokens = inFlight.streamedTokens;
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

/**
 * Follows the steps of a run, for `abortedUsage`: wire its three
 * callbacks into `streamText`, and on abort settle `aborted(steps)`.
 * Where no step list is handed over (a stream error), `spent()` is the
 * steps it saw finish, plus the step in flight only if the provider had
 * begun to answer it: a call refused outright was not billed.
 * `promptTokens` estimates what the first step reads.
 *
 * A step that finishes without usage — the provider failed partway
 * through it, and the SDK records it with none — is estimated like the
 * step in flight, once the provider had begun to answer. `unreported()`
 * is the sum of those estimates, which a run's reported total lacks.
 */
export function inFlightTracker(promptTokens: number) {
  let streamed: string | null = null;
  const finished: { usage?: TokenUsage }[] = [];
  let unreported: TokenUsage = {};
  const aborted = (steps: ReadonlyArray<{ usage?: TokenUsage }>) =>
    abortedUsage(
      steps,
      streamed === null
        ? null
        : { promptTokens, streamedTokens: estimateTokenCount(streamed) }
    );
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
    onStepFinish: (step: { usage?: TokenUsage }) => {
      const reported =
        (step.usage?.inputTokens ?? 0) + (step.usage?.outputTokens ?? 0) > 0;
      if (!reported && streamed) {
        const estimate = inFlightStepUsage(finished, {
          promptTokens,
          streamedTokens: estimateTokenCount(streamed),
        });
        unreported = sumUsage(unreported, estimate);
        finished.push({ usage: estimate });
      } else {
        finished.push({ usage: step.usage });
      }
      streamed = null;
    },
    aborted,
    spent: () => (streamed ? aborted(finished) : abortedUsage(finished, null)),
    unreported: () => unreported,
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
