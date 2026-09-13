import { describe, expect, it } from "vitest";

import { parseChatBody } from "./body";

const ID = "0f1e2d3c-4b5a-4f6e-8d7c-9b8a7f6e5d4c";
const opts = { maxMessageLength: 10, attachments: false as const };

function body(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    messages: [
      { id: "m", role: "user", parts: [{ type: "text", text: "hi" }] },
    ],
    ...overrides,
  };
}

describe("parseChatBody", () => {
  it("accepts the AI SDK transport shape and hands back the extras", () => {
    const parsed = parseChatBody(
      body({ agentId: "support", trigger: "submit-message" }),
      opts
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.body.extra).toEqual({ agentId: "support" });
    expect(parsed.body.trigger).toBe("submit-message");
  });

  it("rejects what is not a turn", () => {
    for (const bad of [
      null,
      "x",
      body({ id: "not-a-uuid" }),
      body({ messages: [] }),
      body({ messages: [{ id: "m", role: "tool", parts: [] }] }),
      body({ messages: [{ id: "m", role: "user", parts: ["text"] }] }),
      body({ trigger: "something-else" }),
    ]) {
      const parsed = parseChatBody(bad, opts);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.rejection.key).toBe("invalidBody");
    }
  });

  it("caps the last user message's text", () => {
    const parsed = parseChatBody(
      body({
        messages: [
          {
            id: "m",
            role: "user",
            parts: [{ type: "text", text: "far too long" }],
          },
        ],
      }),
      opts
    );
    expect(parsed).toEqual({
      ok: false,
      rejection: { key: "messageTooLong", params: { max: 10 } },
    });
  });

  it("applies the attachment policy to file parts", () => {
    const file = (mediaType: string, url = "data:x;base64,AAAAAAAA") => ({
      id: "m",
      role: "user",
      parts: [{ type: "file", mediaType, url }],
    });
    expect(
      parseChatBody(body({ messages: [file("image/png")] }), opts).ok
    ).toBe(false);
    expect(
      parseChatBody(body({ messages: [file("image/png")] }), {
        ...opts,
        attachments: { accept: ["image/png"] },
      }).ok
    ).toBe(true);
    expect(
      parseChatBody(body({ messages: [file("image/gif")] }), {
        ...opts,
        attachments: { accept: ["image/png"] },
      }).ok
    ).toBe(false);
    expect(
      parseChatBody(body({ messages: [file("image/png")] }), {
        ...opts,
        attachments: { accept: ["image/png"], maxBytes: 2 },
      }).ok
    ).toBe(false);
  });
});

describe("parseChatBody — stored attachments and continuations", () => {
  const stored = {
    maxMessageLength: 100,
    attachments: { accept: ["image/png"], mode: "stored" as const },
  };
  const filePart = (url: string) => ({
    id: "m",
    role: "user",
    parts: [{ type: "file", mediaType: "image/png", url }],
  });

  it("accepts the app URL of an upload and refuses anything else", () => {
    expect(
      parseChatBody(body({ messages: [filePart("/api/chat/attachments/a-1")] }), stored).ok
    ).toBe(true);
    expect(
      parseChatBody(
        body({ messages: [filePart("https://app.test/api/chat/attachments/a-1")] }),
        stored
      ).ok
    ).toBe(true);
    for (const url of [
      "data:image/png;base64,AAAA",
      "https://elsewhere.test/file.png",
      "/api/chat/attachments/",
      "/api/chat/attachments/a/b",
    ]) {
      const parsed = parseChatBody(body({ messages: [filePart(url)] }), stored);
      expect(parsed.ok, url).toBe(false);
      if (!parsed.ok) expect(parsed.rejection.key).toBe("attachmentRejected");
    }
  });

  it("honours a custom urlFor", () => {
    const custom = {
      ...stored,
      attachments: { ...stored.attachments, urlFor: (id: string) => `/files/${id}/view` },
    };
    expect(parseChatBody(body({ messages: [filePart("/files/a-1/view")] }), custom).ok).toBe(true);
    expect(
      parseChatBody(body({ messages: [filePart("/api/chat/attachments/a-1")] }), custom).ok
    ).toBe(false);
  });

  it("accepts a continuation only when it names the assistant message it continues", () => {
    const assistant = { id: "a-1", role: "assistant", parts: [{ type: "text", text: "…" }] };
    const user = { id: "m", role: "user", parts: [{ type: "text", text: "hi" }] };
    expect(
      parseChatBody(
        body({ messages: [user, assistant], trigger: "submit-message", messageId: "a-1" }),
        opts
      ).ok
    ).toBe(true);
    expect(parseChatBody(body({ messages: [user, assistant] }), opts).ok).toBe(false);
    expect(
      parseChatBody(
        body({ messages: [user, assistant], trigger: "regenerate-message", messageId: "a-1" }),
        opts
      ).ok
    ).toBe(false);
    expect(
      parseChatBody(
        body({ messages: [user, assistant], trigger: "submit-message", messageId: "other" }),
        opts
      ).ok
    ).toBe(false);
  });
});

describe("attachmentIdFromUrl", () => {
  it("reads the id out of relative and absolute app URLs", async () => {
    const { attachmentIdFromUrl, attachmentUrl } = await import("./body");
    expect(attachmentUrl({}, "x")).toBe("/api/chat/attachments/x");
    expect(attachmentIdFromUrl({}, "/api/chat/attachments/x")).toBe("x");
    expect(attachmentIdFromUrl({}, "https://a.test/api/chat/attachments/x")).toBe("x");
    expect(attachmentIdFromUrl({}, "https://a.test/other/x")).toBeNull();
  });
});
