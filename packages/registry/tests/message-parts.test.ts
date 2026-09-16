/**
 * The chat's message layout rules, pinned: which parts fold into one
 * activity stream, when that stream is still working, and how sources
 * are numbered for the `[n]` markers in the text.
 */

import { describe, expect, it } from "vitest";

import {
  collectSources,
  groupParts,
  isActivityWorking,
  linkCitations,
  parseCitationHref,
  primaryInput,
  sourcesFromSourcePart,
  sourcesFromToolOutput,
  titleFromUrl,
  type PartLike,
} from "../base/chat/lib/message-parts";

type Part = PartLike & {
  text?: string;
  state?: string;
  output?: unknown;
  url?: string;
  title?: string;
};

const text = (value: string): Part => ({ type: "text", text: value });
const reasoning = (value: string): Part => ({ type: "reasoning", text: value });
const tool = (
  name: string,
  state = "output-available",
  output?: unknown
): Part => ({
  type: `tool-${name}`,
  state,
  output,
});
const step: Part = { type: "step-start" };
const notCard = () => false;

describe("groupParts", () => {
  it("folds reasoning and tool calls between text into one activity", () => {
    const segments = groupParts(
      [
        step,
        reasoning("hm"),
        tool("webSearch"),
        step,
        tool("webSearch"),
        text("Answer"),
      ],
      notCard
    );
    expect(segments.map((s) => s.kind)).toEqual(["activity", "part"]);
    const activity = segments[0] as Extract<
      (typeof segments)[number],
      { kind: "activity" }
    >;
    expect(activity.parts.map((p) => p.index)).toEqual([1, 2, 4]);
  });

  it("starts a new activity after text", () => {
    const segments = groupParts(
      [tool("a"), text("so far"), tool("b"), text("done")],
      notCard
    );
    expect(segments.map((s) => s.kind)).toEqual([
      "activity",
      "part",
      "activity",
      "part",
    ]);
  });

  it("empty text does not break a run", () => {
    const segments = groupParts([tool("a"), text(""), tool("b")], notCard);
    expect(segments).toHaveLength(1);
  });

  it("a card tool stands on its own and breaks the run", () => {
    const segments = groupParts(
      [tool("a"), tool("saveArtifact"), tool("b")],
      (part) => part.type === "tool-saveArtifact"
    );
    expect(segments.map((s) => s.kind)).toEqual([
      "activity",
      "part",
      "activity",
    ]);
  });

  it("drops empty reasoning", () => {
    expect(groupParts([reasoning("")], notCard)).toEqual([]);
  });

  it("data parts stand on their own", () => {
    const segments = groupParts(
      [tool("a"), { type: "data-chat-task" }],
      notCard
    );
    expect(segments.map((s) => s.kind)).toEqual(["activity", "part"]);
  });
});

describe("isActivityWorking", () => {
  const [segment] = groupParts(
    [tool("a", "input-available")],
    notCard
  ) as Array<{
    kind: "activity";
    key: string;
    parts: Array<{ index: number; part: Part }>;
  }>;
  const [settled] = groupParts([tool("a")], notCard) as Array<{
    kind: "activity";
    key: string;
    parts: Array<{ index: number; part: Part }>;
  }>;

  it("is never working once the message stopped streaming", () => {
    expect(isActivityWorking(segment!, true, false)).toBe(false);
  });

  it("works while it is the newest segment", () => {
    expect(isActivityWorking(settled!, true, true)).toBe(true);
  });

  it("works while a call is unsettled, even with text after it", () => {
    expect(isActivityWorking(segment!, false, true)).toBe(true);
    expect(isActivityWorking(settled!, false, true)).toBe(false);
  });
});

describe("collectSources", () => {
  const sourcesOf = (part: Part) =>
    part.type.startsWith("tool-")
      ? sourcesFromToolOutput(part.output)
      : sourcesFromSourcePart(part);

  it("numbers source parts and tool sources in order, deduped by url", () => {
    const sources = collectSources(
      [
        { type: "source-url", url: "https://a.com/x", title: "A" },
        tool("webSearch", "output-available", {
          sources: [{ url: "https://b.com" }, { url: "https://a.com/x" }],
        }),
      ],
      sourcesOf
    );
    expect(sources.map((s) => [s.index, s.url])).toEqual([
      [1, "https://a.com/x"],
      [2, "https://b.com"],
    ]);
  });

  it("keeps the numbers a tool assigned and fills around them", () => {
    const sources = collectSources(
      [
        tool("webSearch", "output-available", {
          sources: [
            { url: "https://c.com", index: 7 },
            { url: "https://d.com", index: 8 },
          ],
        }),
        { type: "source-url", url: "https://e.com" },
      ],
      sourcesOf
    );
    expect(sources.map((s) => [s.index, s.url])).toEqual([
      [1, "https://e.com"],
      [7, "https://c.com"],
      [8, "https://d.com"],
    ]);
  });

  it("ignores malformed tool output", () => {
    expect(sourcesFromToolOutput({ sources: [null, 3, {}] })).toEqual([]);
    expect(sourcesFromToolOutput("text")).toEqual([]);
  });
});

describe("citations in text", () => {
  it("links known markers and merges adjacent ones", () => {
    expect(linkCitations("Fact [1][2]. Other [9].", new Set([1, 2]))).toBe(
      "Fact [1,2](#cite-1,2). Other [9]."
    );
  });

  it("links a comma-separated marker", () => {
    expect(linkCitations("Released [2, 3].", new Set([2, 3]))).toBe(
      "Released [2,3](#cite-2,3)."
    );
  });

  it("leaves markdown links alone", () => {
    expect(linkCitations("[1](https://x.com)", new Set([1]))).toBe(
      "[1](https://x.com)"
    );
  });

  it("parses what it wrote", () => {
    expect(parseCitationHref("#cite-1,2")).toEqual([1, 2]);
    expect(parseCitationHref("https://x.com")).toBeNull();
  });
});

describe("titleFromUrl", () => {
  it("de-slugs the last meaningful path segment", () => {
    expect(
      titleFromUrl(
        "https://www.herodevs.com/blog-posts/node-js-end-of-life-dates"
      )
    ).toBe("Node js end of life dates");
    expect(titleFromUrl("https://en.wikipedia.org/wiki/TypeScript")).toBe(
      "TypeScript"
    );
  });

  it("skips ids and names nothing for a front page", () => {
    expect(titleFromUrl("https://github.com/nodejs/node/releases/123456")).toBe(
      "Releases"
    );
    expect(titleFromUrl("https://dev.to/")).toBeUndefined();
  });
});

describe("primaryInput", () => {
  it("returns the first non-empty string field", () => {
    expect(primaryInput({ limit: 3, query: "weather" })).toBe("weather");
    expect(primaryInput({})).toBeUndefined();
  });
});
