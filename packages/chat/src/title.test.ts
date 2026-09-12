import { describe, expect, it } from "vitest";

import { truncateTitle } from "./title";

/**
 * The default title is what stops every conversation in a history
 * sidebar reading "Untitled": the failure is silent and only visible
 * days later once a workspace has a list.
 */
describe("truncateTitle", () => {
  it("titles a conversation from its first line", () => {
    expect(truncateTitle("Summarize this quarter's numbers")).toBe(
      "Summarize this quarter's numbers"
    );
    expect(truncateTitle("Fix the build\n\nIt fails on CI only")).toBe(
      "Fix the build"
    );
  });

  it("truncates a long opener rather than letting it fill the sidebar", () => {
    const title = truncateTitle("a".repeat(200));
    expect(title).not.toBeNull();
    expect(title!.length).toBeLessThanOrEqual(60);
    expect(title!.endsWith("…")).toBe(true);
  });

  it("leaves an empty opener untitled rather than titled with whitespace", () => {
    expect(truncateTitle("   \n  ")).toBeNull();
  });
});
