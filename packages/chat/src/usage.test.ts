import { describe, expect, it } from "vitest";

import { abortedUsage, sumStepUsage } from "./usage";

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
