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
