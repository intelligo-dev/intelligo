import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import { sanitizeForShare } from "./share";

const transcript: UIMessage[] = [
  {
    id: "u1",
    role: "user",
    parts: [
      { type: "text", text: "Summarise this" },
      {
        type: "file",
        mediaType: "application/pdf",
        filename: "q3.pdf",
        url: "https://bucket.example/signed?token=secret",
      },
    ],
  },
  {
    id: "a1",
    role: "assistant",
    parts: [
      { type: "reasoning", text: "Let me think" },
      {
        type: "tool-search",
        toolCallId: "c1",
        state: "output-available",
        input: { q: "internal" },
        output: { hits: ["private"] },
        callProviderMetadata: { openai: { x: 1 } },
      } as unknown as UIMessage["parts"][number],
      {
        type: "tool-generateReport",
        toolCallId: "c2",
        state: "output-available",
        input: { kind: "q3" },
        output: { title: "Q3" },
      } as unknown as UIMessage["parts"][number],
      { type: "source-url", sourceId: "s1", url: "https://example.com" },
      { type: "data-chat-status", data: { label: "Searching" } },
      {
        type: "data-chat-artifact",
        id: "art",
        data: { id: "art", kind: "text", title: "Q3", status: "ready" },
      },
      { type: "text", text: "Here it is [1]", state: "done" },
    ],
  },
];

describe("sanitizeForShare", () => {
  it("strips reasoning, tool I/O, provider metadata, transient data and file URLs", () => {
    const [user, assistant] = sanitizeForShare(transcript);
    expect(user!.parts).toEqual([
      { type: "text", text: "Summarise this" },
      { type: "file", mediaType: "application/pdf", filename: "q3.pdf", url: "" },
    ]);
    expect(assistant!.parts.map((p) => p.type)).toEqual([
      "tool-search",
      "tool-generateReport",
      "source-url",
      "data-chat-artifact",
      "text",
    ]);
    const search = assistant!.parts[0] as Record<string, unknown>;
    expect(search).toEqual({
      type: "tool-search",
      toolCallId: "c1",
      state: "output-available",
    });
    expect(JSON.stringify(assistant)).not.toContain("private");
    expect(JSON.stringify(assistant)).not.toContain("secret");
  });

  it("keeps the output of tools the policy names, and reasoning when asked", () => {
    const [, assistant] = sanitizeForShare(transcript, {
      keepToolOutput: ["generateReport"],
      keepReasoning: true,
    });
    expect(assistant!.parts[0]).toMatchObject({ type: "reasoning" });
    const report = assistant!.parts.find(
      (p) => p.type === "tool-generateReport"
    ) as Record<string, unknown>;
    expect(report).toMatchObject({ input: { kind: "q3" }, output: { title: "Q3" } });
  });

  it("keeps only the data parts the policy lists", () => {
    const [, assistant] = sanitizeForShare(transcript, {
      keepDataParts: ["chat-status"],
    });
    expect(assistant!.parts.map((p) => p.type)).toContain("data-chat-status");
    expect(assistant!.parts.map((p) => p.type)).not.toContain(
      "data-chat-artifact"
    );
  });
});
