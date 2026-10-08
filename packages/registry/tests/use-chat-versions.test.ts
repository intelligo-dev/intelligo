/**
 * Reply versions: an older version is for reading, so the thread must
 * know when one is on screen.
 */

import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import {
  olderVersionOnScreen,
  ROOT_ANCHOR,
} from "../base/chat/hooks/use-chat-versions";

const message = (id: string, role: UIMessage["role"]): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text: id }],
});

describe("olderVersionOnScreen", () => {
  const messages = [
    message("u1", "user"),
    message("a1", "assistant"),
    message("u2", "user"),
    message("a2", "assistant"),
  ];

  it("is null while every version set shows its latest version", () => {
    expect(
      olderVersionOnScreen(
        { u1: { tails: [[], []], active: 1 }, u2: { tails: [[]], active: 0 } },
        messages
      )
    ).toBeNull();
  });

  it("names the outermost set on screen that shows an older version", () => {
    expect(
      olderVersionOnScreen(
        {
          u2: { tails: [[], []], active: 0 },
          [ROOT_ANCHOR]: { tails: [[], []], active: 0 },
        },
        messages
      )
    ).toEqual({ anchorId: ROOT_ANCHOR });
    expect(
      olderVersionOnScreen({ u2: { tails: [[], []], active: 0 } }, messages)
    ).toEqual({ anchorId: "u2" });
  });

  it("ignores a set whose anchor is not on screen", () => {
    expect(
      olderVersionOnScreen({ gone: { tails: [[], []], active: 0 } }, messages)
    ).toBeNull();
  });
});
