import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import {
  applyConversationWindow,
  estimateConversationTokens,
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

  it("counts a Cyrillic line at two characters per token", () => {
    // 13 characters: 11 Cyrillic at ½ a token each, two spaces at ¼.
    // The exact number is what makes the two rates observable — a
    // single divisor would window this transcript far too late.
    expect(estimateTokenCount("сайн байна уу")).toBe(6);
  });

  it("puts the Latin/non-Latin line at U+024F", () => {
    // The last character of Latin Extended-B counts as Latin; the
    // first character past it does not.
    expect(estimateTokenCount("ɏ".repeat(4))).toBe(1);
    expect(estimateTokenCount("ɐ".repeat(4))).toBe(2);
  });

  it("costs nothing for no text", () => {
    expect(estimateTokenCount("")).toBe(0);
  });
});

describe("estimateConversationTokens", () => {
  it("counts a tool payload by its serialised size", () => {
    // Tool parts are not text but still cost tokens. `{"type":"tool-call"}`
    // is 20 characters, which at the Latin rate is 5 tokens.
    const message = {
      id: "t",
      role: "assistant",
      parts: [{ type: "tool-call" }],
    } as unknown as UIMessage;
    expect(estimateConversationTokens([message])).toBe(5);
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

  it("stops at the first window that fits, not the one after it", () => {
    // Three one-token turns against a two-token budget. The window
    // that fits is the last two; dropping one more would throw away
    // context the budget could afford.
    const turns = [
      m("user", "abcd", "t1"),
      m("user", "abcd", "t2"),
      m("user", "abcd", "t3"),
    ];
    const { windowed } = applyConversationWindow(turns, {
      maxMessages: 10,
      maxTokens: 2,
    });
    expect(windowed.map((x) => x.id)).toEqual(["t2", "t3"]);
  });

  it("keeps the last turn even when it alone blows the budget", () => {
    // A window of nothing is worse than one that cannot fit: the model
    // would be asked to answer a conversation it was shown none of.
    const long = [
      m("user", "a".repeat(400), "big1"),
      m("user", "b".repeat(400), "big2"),
    ];
    const { windowed, pruned } = applyConversationWindow(long, {
      maxMessages: 10,
      maxTokens: 5,
    });
    expect(windowed.map((x) => x.id)).toEqual(["big2"]);
    expect(pruned.map((x) => x.id)).toEqual(["big1"]);
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

  it("takes a part only when the whole shape is right", () => {
    // Everything here is a near miss, and each one would reach the
    // model as text if the guard checked one condition less.
    expect(
      extractText([
        { type: "text", text: "a" },
        { type: "text" }, // no text at all
        { type: "text", text: 5 }, // text, but not a string
        { type: "file", text: "no" }, // a string, but not a text part
        null, // typeof null is "object"
        "text", // not an object at all
        // Not an object either, however much it looks like a part.
        Object.assign(() => "x", { type: "text", text: "fn" }),
        { type: "text", text: "b" },
      ])
    ).toBe("a b");
  });
});
