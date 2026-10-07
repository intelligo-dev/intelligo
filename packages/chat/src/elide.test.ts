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

const urls = (m: UIMessage) =>
  m.parts.flatMap((part) =>
    part.type === "file" ? [(part as { url: string }).url] : []
  );

describe("elideEarlierFiles", () => {
  it("replaces earlier messages' inline bytes and leaves the rest", () => {
    const out = elideEarlierFiles([
      message("a", DATA, STORED),
      message("b"),
      message("c", DATA),
    ]);
    expect(urls(out[0]!)).toEqual([ELIDED_FILE_URL, STORED]);
    expect(out[1]).toEqual(message("b"));
    expect(urls(out[2]!)).toEqual([DATA]);
    expect(hasElidedFile(out[0]!)).toBe(true);
    expect(hasElidedFile(out[2]!)).toBe(false);
  });

  it("builds the request the default transport would, elided", () => {
    const request = sendWithoutEarlierFiles({
      id: "conv",
      messages: [message("a", DATA), message("b")],
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
