import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import {
  applyConversationWindow,
  estimateConversationTokens,
  estimateTokenCount,
  extractText,
  IMAGE_TOKEN_ESTIMATE,
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

  function file(mediaType: string, url: string): UIMessage {
    return { id: "f", role: "user", parts: [{ type: "file", mediaType, url }] };
  }
  const base64Of = (bytes: number) => Buffer.alloc(bytes, 7).toString("base64");

  it("counts an inline image at a flat estimate, not its encoded size", () => {
    const megabyte = file(
      "image/png",
      `data:image/png;base64,${base64Of(1 << 20)}`
    );
    expect(estimateConversationTokens([megabyte])).toBe(IMAGE_TOKEN_ESTIMATE);
    expect(
      estimateConversationTokens([file("image/jpeg", "https://cdn.test/a.jpg")])
    ).toBe(IMAGE_TOKEN_ESTIMATE);
  });

  it("counts an inline text file by its decoded length", () => {
    const text = Buffer.from("a".repeat(4_000)).toString("base64");
    expect(
      estimateConversationTokens([
        file("text/plain", `data:text/plain;base64,${text}`),
      ])
    ).toBe(1_000);
    expect(
      estimateConversationTokens([
        file("application/json", `data:application/json,${"x".repeat(400)}`),
      ])
    ).toBe(100);
  });

  it("counts another document by its decoded size, never under the floor", () => {
    expect(
      estimateConversationTokens([
        file(
          "application/pdf",
          `data:application/pdf;base64,${base64Of(160_000)}`
        ),
      ])
    ).toBe(10_000);
    expect(
      estimateConversationTokens([
        file("application/pdf", `data:application/pdf;base64,${base64Of(100)}`),
      ])
    ).toBe(1_600);
    expect(
      estimateConversationTokens([
        file("application/pdf", "/api/chat/attachments/a-1"),
      ])
    ).toBe(1_600);
  });
});

describe("estimateConversationTokens — file payloads", () => {
  const text = (url: string, mediaType = "text/plain"): UIMessage => ({
    id: "f",
    role: "user",
    parts: [{ type: "file", mediaType, url }],
  });

  it("subtracts base64 padding from the decoded size", () => {
    // 12 base64 characters are 9 bytes, 8 with one pad and 6 with two.
    expect(
      estimateConversationTokens([text("data:text/plain;base64,AAAAAAAAAAAA")])
    ).toBe(3);
    expect(
      estimateConversationTokens([text("data:text/plain;base64,AAAAAAAAAAA=")])
    ).toBe(2);
    expect(
      estimateConversationTokens([text("data:text/plain;base64,AAAAAA==")])
    ).toBe(1);
  });

  it("counts a data URL with no payload as empty", () => {
    expect(estimateConversationTokens([text("data:text/plain")])).toBe(0);
  });

  it("counts a linked text file at the floor, not by its URL", () => {
    expect(
      estimateConversationTokens([text("https://files.test/notes.txt")])
    ).toBe(1_600);
  });

  it("counts a file part with no URL or media type at the floor", () => {
    const bare: UIMessage = {
      id: "f",
      role: "user",
      parts: [{ type: "file" } as unknown as UIMessage["parts"][number]],
    };
    expect(estimateConversationTokens([bare])).toBe(1_600);
    expect(
      estimateConversationTokens([
        {
          id: "g",
          role: "user",
          parts: [
            {
              type: "file",
              url: `data:,${"x".repeat(400)}`,
            } as unknown as UIMessage["parts"][number],
          ],
        },
      ])
    ).toBe(1_600);
  });

  it("reads a structured-syntax suffix as text, and only a leading text/", () => {
    const payload = `,${"x".repeat(400)}`;
    expect(
      estimateConversationTokens([
        text(`data:application/ld+json${payload}`, "application/ld+json"),
      ])
    ).toBe(100);
    expect(
      estimateConversationTokens([
        text(`data:application/x.text/foo${payload}`, "application/x.text/foo"),
      ])
    ).toBe(1_600);
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

  it("keeps the question when the assistant message being continued is over budget", () => {
    const transcript = [
      m("user", "earlier", "u1"),
      m("assistant", "done", "a1"),
      m("user", "search for it", "u2"),
      m("assistant", "r".repeat(4_000), "a2"),
    ];
    const { windowed, pruned } = applyConversationWindow(transcript, {
      maxMessages: 10,
      maxTokens: 100,
    });
    expect(windowed.map((x) => x.id)).toEqual(["u2", "a2"]);
    expect(pruned.map((x) => x.id)).toEqual(["u1", "a1"]);
  });

  it("keeps the last message when no user message is anywhere in it", () => {
    const replies = [
      m("assistant", "a".repeat(400), "a1"),
      m("assistant", "b".repeat(400), "a2"),
      m("assistant", "c".repeat(400), "a3"),
    ];
    const { windowed, pruned } = applyConversationWindow(replies, {
      maxMessages: 10,
      maxTokens: 1,
    });
    expect(windowed.map((x) => x.id)).toEqual(["a3"]);
    expect(pruned.map((x) => x.id)).toEqual(["a1", "a2"]);
  });

  it("reaches back to a question at the very start", () => {
    const { windowed } = applyConversationWindow(
      [m("user", "q", "u1"), m("assistant", "r".repeat(400), "a1")],
      { maxMessages: 10, maxTokens: 1 }
    );
    expect(windowed.map((x) => x.id)).toEqual(["u1", "a1"]);
  });

  it("keeps the system messages of a transcript with no turns", () => {
    const { windowed } = applyConversationWindow([m("system", "sys")], {
      maxMessages: 5,
      maxTokens: 10,
    });
    expect(windowed.map((x) => x.id)).toEqual(["sys"]);
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
