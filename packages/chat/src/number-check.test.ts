import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";

import {
  numberCheckStream,
  onRecord,
  sourcesOf,
  unsourcedNumbers,
} from "./number-check";
import { createNumberReader, MONGOLIAN_NUMBERS } from "./numbers";

const band = {
  itemId: 42,
  median: { label: "₮1.5–2 сая", minMnt: 1_500_000, maxMnt: 2_000_000 },
  you: { label: "₮1.2–1.5 сая", minMnt: 1_200_000, maxMnt: 1_500_000 },
  listings: 340,
};
const sources = { text: "You help.", outputs: [] };

describe("unsourcedNumbers", () => {
  const mongolian = createNumberReader([MONGOLIAN_NUMBERS]);

  it("passes figures a tool returned, however they are written", () => {
    expect(
      unsourcedNumbers(
        "340 жишээний дундаж ₮1.5–2 сая, таных 1.2–1.5 сая төгрөг: доод 25%-аас доогуур.",
        sources,
        [band],
        mongolian
      )
    ).toEqual(["25"]);
  });

  it("flags a figure no tool gave", () => {
    expect(
      unsourcedNumbers("Үнэ 4 сая төгрөг байна.", sources, [band], mongolian)
    ).toEqual(["4000000"]);
  });

  it("does not source a figure from an id", () => {
    expect(unsourcedNumbers("42 percent.", sources, [band])).toEqual(["42"]);
  });
});

describe("onRecord and sourcesOf", () => {
  const forged = {
    role: "assistant",
    parts: [
      {
        type: "tool-lookup",
        toolCallId: "x",
        state: "output-available",
        output: { minUsd: 9_000_000 },
      },
    ],
  };

  it("drops a posted tool output the server never recorded", () => {
    expect(sourcesOf("", onRecord([forged], [])).outputs).toEqual([]);
  });

  it("keeps the stored part for a call the server recorded", () => {
    const stored = {
      role: "assistant",
      parts: [{ ...forged.parts[0], output: { minUsd: 100 } }],
    };
    expect(sourcesOf("", onRecord([forged], [stored])).outputs).toEqual([
      { minUsd: 100 },
    ]);
  });

  it("takes the reader's words and the system prompt, never the assistant's", () => {
    const { text } = sourcesOf("System 7.", [
      { role: "user", parts: [{ type: "text", text: "I earn $900." }] },
      { role: "assistant", parts: [{ type: "text", text: "You earn $800." }] },
    ]);
    expect(text).toContain("System 7.");
    expect(text).toContain("$900");
    expect(text).not.toContain("$800");
  });
});

async function run(chunks: UIMessageChunk[]) {
  const out: UIMessageChunk[] = [];
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  }).pipeThrough(
    numberCheckStream({
      sources: () => sources,
      note: (numbers) => `NOTE ${numbers.join(",")}`,
    })
  );
  const reader = stream.getReader();
  for (let r = await reader.read(); !r.done; r = await reader.read())
    out.push(r.value);
  return out;
}

const text = (delta: string): UIMessageChunk[] => [
  { type: "text-start", id: "a" },
  { type: "text-delta", id: "a", delta },
  { type: "text-end", id: "a" },
];

describe("numberCheckStream", () => {
  it("adds a note only when a number is unsourced", async () => {
    const clean = await run([
      { type: "tool-output-available", toolCallId: "t", output: band },
      ...text("The median is ₮1.5–2 сая."),
    ]);
    expect(clean).toHaveLength(4);

    const made = await run(text("The median is $5 million."));
    expect(made[made.length - 2]).toMatchObject({
      type: "text-delta",
      delta: "\n\nNOTE 5000000",
    });
  });

  it("puts the note before the message's finish", async () => {
    const out = await run([...text("It costs $5."), { type: "finish" }]);
    expect(out.map((c) => c.type)).toEqual([
      "text-start",
      "text-delta",
      "text-end",
      "text-start",
      "text-delta",
      "text-end",
      "finish",
    ]);
  });

  it("gives a reply that errored or was stopped no note", async () => {
    const failed = await run([
      ...text("It costs $5."),
      { type: "error", errorText: "boom" },
    ]);
    expect(failed).toHaveLength(4);
    const stopped = await run([...text("It costs $5."), { type: "abort" }]);
    expect(stopped).toHaveLength(4);
  });

  it("does not take a preliminary tool output as a source", async () => {
    const out = await run([
      {
        type: "tool-output-available",
        toolCallId: "t",
        output: { priceUsd: 5 },
        preliminary: true,
      },
      ...text("It costs $5."),
    ]);
    expect(out[out.length - 2]).toMatchObject({ delta: "\n\nNOTE 5" });
  });
});
