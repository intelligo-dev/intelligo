import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import {
  ELIDED_FILE_URL,
  elideEarlierFiles,
  hasElidedFile,
  sendWithoutEarlierFiles,
} from "./elide";
import { restoreElidedFiles } from "./messages";

const DATA = "data:image/png;base64,AAAA";
const STORED = "/api/chat/attachments/att-1";

function message(id: string, ...urls: string[]): UIMessage {
  return {
    id,
    role: "user",
    parts: [
      { type: "text", text: id },
      ...urls.map((url) => ({
        type: "file" as const,
        mediaType: "image/png",
        url,
      })),
    ],
  };
}

function reply(id: string, ...urls: string[]): UIMessage {
  return { ...message(id, ...urls), role: "assistant" };
}

const urls = (m: UIMessage) =>
  m.parts.flatMap((part) =>
    part.type === "file" ? [(part as { url: string }).url] : []
  );

describe("elideEarlierFiles", () => {
  it("replaces earlier messages' inline bytes and leaves the rest", () => {
    const out = elideEarlierFiles([
      message("a", DATA, STORED),
      reply("r1", DATA),
      message("b"),
      reply("r2"),
      message("c", DATA),
    ]);
    expect(urls(out[0]!)).toEqual([ELIDED_FILE_URL, STORED]);
    expect(urls(out[1]!)).toEqual([ELIDED_FILE_URL]);
    expect(out[2]).toEqual(message("b"));
    expect(urls(out[4]!)).toEqual([DATA]);
    expect(hasElidedFile(out[0]!)).toBe(true);
    expect(hasElidedFile(out[4]!)).toBe(false);
  });

  it("keeps the bytes of a message no reply answered", () => {
    // A turn refused before it ran leaves its message in the client's
    // transcript and nowhere else: there is no stored copy to restore.
    const out = elideEarlierFiles([message("refused", DATA), message("well?")]);
    expect(urls(out[0]!)).toEqual([DATA]);
    expect(hasElidedFile(out[0]!)).toBe(false);

    const later = elideEarlierFiles([
      message("refused", DATA),
      message("again", DATA),
      reply("r1"),
      message("next"),
    ]);
    expect(urls(later[0]!)).toEqual([DATA]);
    expect(urls(later[1]!)).toEqual([ELIDED_FILE_URL]);
  });

  it("builds the request the default transport would, elided", () => {
    const request = sendWithoutEarlierFiles({
      id: "conv",
      messages: [message("a", DATA), reply("r1"), message("b")],
      body: { agentId: "assistant" },
      trigger: "submit-message",
      messageId: undefined,
    });
    expect(request.body).toEqual({
      agentId: "assistant",
      id: "conv",
      messages: [
        {
          ...message("a"),
          parts: [
            { type: "text", text: "a" },
            { type: "file", mediaType: "image/png", url: ELIDED_FILE_URL },
          ],
        },
        reply("r1"),
        message("b"),
      ],
      trigger: "submit-message",
      messageId: undefined,
    });
  });
});

describe("restoreElidedFiles", () => {
  const any = () => true;

  it("takes each elided file from the stored message, by position", () => {
    const sent = [message("a", STORED, ELIDED_FILE_URL), message("b")];
    const stored = [message("a", STORED, DATA)];
    expect(urls(restoreElidedFiles(sent, stored, any)[0]!)).toEqual([
      STORED,
      DATA,
    ]);
  });

  it("drops an elided file with nothing stored to take", () => {
    const out = restoreElidedFiles([message("a", ELIDED_FILE_URL)], [], any);
    expect(out[0]).toEqual(message("a"));
  });

  it("takes nothing from a stored message of another role", () => {
    const stored = [
      {
        ...message("a", "https://internal.example/x"),
        role: "assistant" as const,
      },
    ];
    const out = restoreElidedFiles(
      [message("a", ELIDED_FILE_URL)],
      stored,
      any
    );
    expect(out[0]).toEqual(message("a"));
  });

  it("drops a stored file the policy no longer accepts", () => {
    const stored = [message("a", "https://internal.example/x")];
    const out = restoreElidedFiles(
      [message("a", ELIDED_FILE_URL)],
      stored,
      (part) => String(part.url).startsWith("data:")
    );
    expect(out[0]).toEqual(message("a"));
  });
});
