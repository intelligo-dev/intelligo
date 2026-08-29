/**
 * The reference app's chat seam bindings.
 *
 * `deriveTitle` is the only pure logic in this file, and it is what
 * stops every conversation in the history sidebar reading "Untitled
 * conversation" — worth pinning, because the failure is silent and
 * only visible days later once a workspace has a list.
 *
 * The tool binding is exercised end to end by the stub model instead
 * (a message starting with "save" makes it call `saveArtifact`), which
 * is a truer check than asserting on a `tool()` object's shape.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@intelligo-dev/core/documents", () => ({
  saveDocument: vi.fn(),
}));

import { chatServerConfig } from "@/lib/chat-server-config";

const derive = (text: string) => chatServerConfig.deriveTitle(text);

describe("deriveTitle", () => {
  it("titles a conversation from its first line", () => {
    expect(derive("Summarize this quarter's numbers")).toBe(
      "Summarize this quarter's numbers"
    );
  });

  it("takes only the first line of a multi-line opener", () => {
    expect(derive("Fix the build\n\nIt fails on CI only")).toBe(
      "Fix the build"
    );
  });

  it("truncates a long opener rather than letting it fill the sidebar", () => {
    const title = derive("a".repeat(200));
    expect(title).not.toBeNull();
    expect(title!.length).toBeLessThanOrEqual(60);
    expect(title!.endsWith("…")).toBe(true);
  });

  it("returns null for an empty message, leaving the row untitled", () => {
    // Better an untitled row than a row titled with whitespace: the UI
    // has copy for the first case and renders the second as blank.
    expect(derive("   \n  ")).toBeNull();
  });
});

describe("chat server config defaults", () => {
  it("gates on a feature key the plan catalogue registers", () => {
    expect(chatServerConfig.featureKey).toBe("chat");
  });

  it("allows more than one model step, so a tool call can be followed by a reply", () => {
    expect(chatServerConfig.maxSteps).toBeGreaterThan(1);
  });

  it("binds tools, without which the tool-renderer seam is unreachable", () => {
    expect(chatServerConfig.tools).toBeDefined();
  });
});
