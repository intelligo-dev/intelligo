import { describe, expect, it } from "vitest";

import { commandUsage, usage } from "./usage";

describe("commandUsage", () => {
  it("prints one command's lines, continuations included", () => {
    const text = commandUsage("sync");
    expect(text).toContain("sync [items…]");
    expect(text).toContain("--check only reports");
    expect(text).not.toContain("create [dir]");
  });

  it("covers every line a command has, such as both admin actions", () => {
    const text = commandUsage("admin");
    expect(text).toContain("admin grant <email>");
    expect(text).toContain("admin revoke <email>");
  });

  it("falls back to the whole usage for a name it does not know", () => {
    expect(commandUsage("nonsense")).toBe(usage());
  });

  it("documents the exit codes", () => {
    expect(usage()).toMatch(/0 done, 1 .*\n2 the command was used wrongly/);
  });
});
