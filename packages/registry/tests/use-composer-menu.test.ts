import { describe, expect, it } from "vitest";

import { detectTrigger } from "../base/chat/hooks/use-composer-menu";

describe("detectTrigger", () => {
  it("opens the command list for a slash that starts the message", () => {
    expect(detectTrigger("/", 1)).toEqual({ kind: "command", start: 0, query: "" });
    expect(detectTrigger("/sum", 4)).toEqual({ kind: "command", start: 0, query: "sum" });
    expect(detectTrigger("hello /sum", 10)).toBeNull();
    expect(detectTrigger("/sum ", 5)).toBeNull();
  });

  it("opens the mention picker for an @ that starts a word", () => {
    expect(detectTrigger("ask @doc", 8)).toEqual({ kind: "mention", start: 4, query: "doc" });
    expect(detectTrigger("@", 1)).toEqual({ kind: "mention", start: 0, query: "" });
    expect(detectTrigger("mail@example", 12)).toBeNull();
    expect(detectTrigger("ask @doc more", 13)).toBeNull();
  });

  it("honours a custom mention trigger and the caret position", () => {
    expect(detectTrigger("see #q3", 7, "#")).toEqual({ kind: "mention", start: 4, query: "q3" });
    expect(detectTrigger("see @q3 and more", 7)).toEqual({ kind: "mention", start: 4, query: "q3" });
  });
});
