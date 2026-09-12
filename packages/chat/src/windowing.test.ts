import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import {
  applyConversationWindow,
  estimateTokenCount,
  extractText,
} from "./windowing";

function m(role: UIMessage["role"], text: string, id = text): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

describe("estimateTokenCount", () => {
  it("counts non-Latin script at twice the rate", () => {
    expect(estimateTokenCount("abcdefgh")).toBe(2);
    expect(estimateTokenCount("сайн байна уу")).toBeGreaterThan(
      estimateTokenCount("hello you")
    );
  });
});

describe("applyConversationWindow", () => {
  const transcript = [
    m("system", "sys"),
    m("user", "u1"),
    m("assistant", "a1"),
    m("user", "u2"),
    m("assistant", "a2"),
    m("user", "u3"),
  ];

  it("keeps the most recent turns and every system message", () => {
    const { windowed, pruned } = applyConversationWindow(transcript, {
      maxMessages: 3,
    });
    expect(windowed.map((x) => x.id)).toEqual(["sys", "u2", "a2", "u3"]);
    expect(pruned.map((x) => x.id)).toEqual(["u1", "a1"]);
  });

  it("opens the window on a user turn", () => {
    const { windowed } = applyConversationWindow(transcript, {
      maxMessages: 2,
    });
    expect(windowed.map((x) => x.id)).toEqual(["sys", "u3"]);
  });

  it("never returns an empty window", () => {
    const { windowed } = applyConversationWindow([m("assistant", "a")], {
      maxMessages: 1,
    });
    expect(windowed).toHaveLength(1);
  });

  it("drops from the front until a token budget fits", () => {
    const long = [
      m("user", "x".repeat(400), "big"),
      m("assistant", "a"),
      m("user", "short"),
    ];
    const { windowed } = applyConversationWindow(long, {
      maxMessages: 10,
      maxTokens: 20,
    });
    expect(windowed.map((x) => x.id)).toEqual(["short"]);
  });
});

describe("extractText", () => {
  it("joins text parts and ignores the rest", () => {
    expect(
      extractText([
        { type: "text", text: "a" },
        { type: "file" },
        { type: "text", text: "b" },
      ])
    ).toBe("a b");
  });
});
