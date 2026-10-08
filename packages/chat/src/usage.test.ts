import { describe, expect, it } from "vitest";

import { abortedUsage, inFlightTracker, sumStepUsage } from "./usage";

describe("abortedUsage", () => {
  const finished = [
    { usage: { inputTokens: 100, outputTokens: 20 } },
    { usage: { inputTokens: 130, outputTokens: 5 } },
  ];

  it("charges the first step's prompt and what it streamed when it never finished", () => {
    expect(abortedUsage([], { promptTokens: 400, streamedTokens: 12 })).toEqual(
      { inputTokens: 400, outputTokens: 12, totalTokens: 412 }
    );
  });

  it("reads a later step's prompt as the previous step's prompt and output", () => {
    expect(
      abortedUsage(finished, { promptTokens: 400, streamedTokens: 7 })
    ).toEqual({
      inputTokens: 100 + 130 + (130 + 5),
      outputTokens: 20 + 5 + 7,
      totalTokens: 100 + 130 + 135 + 20 + 5 + 7,
    });
  });

  it("counts only the finished steps when no step was in flight", () => {
    expect(abortedUsage(finished, null)).toEqual(sumStepUsage(finished));
  });

  it("falls back to the prompt estimate when the previous step reported nothing", () => {
    expect(
      abortedUsage([{}], { promptTokens: 400, streamedTokens: 3 })
    ).toEqual({ inputTokens: 400, outputTokens: 3, totalTokens: 403 });
  });
});

describe("inFlightTracker", () => {
  const usage = (inputTokens: number, outputTokens: number) => ({
    inputTokens,
    outputTokens,
  });

  it("counts the finished steps, and a step in flight only once it answered", () => {
    const tracker = inFlightTracker(400);
    tracker.onStepStart();
    tracker.onChunk({ chunk: { type: "text-delta", text: "abcd" } });
    tracker.onStepFinish({ usage: usage(100, 20) });
    tracker.onStepStart();
    // Refused before it answered: not billed.
    expect(tracker.spent()).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
    });
    tracker.onChunk({ chunk: { type: "reasoning-delta", text: "abcdefgh" } });
    tracker.onChunk({ chunk: { type: "tool-call" } });
    expect(tracker.spent()).toEqual({
      inputTokens: 100 + 120,
      outputTokens: 20 + 2,
      totalTokens: 242,
    });
  });

  it("estimates the first step from the prompt when it is stopped", () => {
    const tracker = inFlightTracker(400);
    tracker.onStepStart();
    expect(tracker.aborted([])).toEqual({
      inputTokens: 400,
      outputTokens: 0,
      totalTokens: 400,
    });
    expect(inFlightTracker(400).aborted([])).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });

  it("estimates a step that finished without usage once it had begun to answer", () => {
    const tracker = inFlightTracker(400);
    tracker.onStepStart();
    tracker.onChunk({ chunk: { type: "text-delta", text: "abcdefgh" } });
    tracker.onStepFinish({ usage: {} });
    const estimate = { inputTokens: 400, outputTokens: 2, totalTokens: 402 };
    expect(tracker.unreported()).toEqual(estimate);
    expect(tracker.spent()).toEqual(estimate);

    // A step that reported nothing and wrote nothing was not answered.
    const silent = inFlightTracker(400);
    silent.onStepStart();
    silent.onStepFinish({ usage: {} });
    expect(silent.unreported()).toEqual({});
    expect(silent.spent()).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });
});
