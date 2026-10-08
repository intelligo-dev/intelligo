import { describe, expect, it } from "vitest";

import { quoteForCmd, spawnCommand } from "./spawn-command.js";

describe("spawnCommand", () => {
  it("runs the binary directly outside Windows", () => {
    expect(
      spawnCommand("/home/a b/app/node_modules/.bin/shadcn", ["add"], "linux")
    ).toEqual({
      command: "/home/a b/app/node_modules/.bin/shadcn",
      args: ["add"],
      shell: false,
    });
  });

  it("quotes a bin path with a space for cmd.exe and runs its .cmd shim", () => {
    expect(
      spawnCommand(
        "C:\\Users\\John Doe\\acme\\node_modules\\.bin\\shadcn",
        ["add", "http://127.0.0.1:5000/intelligo.json", "--yes"],
        "win32"
      )
    ).toEqual({
      command: '"C:\\Users\\John Doe\\acme\\node_modules\\.bin\\shadcn.cmd"',
      args: ["add", "http://127.0.0.1:5000/intelligo.json", "--yes"],
      shell: true,
    });
  });

  it("leaves a bare command name for cmd.exe to resolve", () => {
    expect(spawnCommand("pnpm", ["install"], "win32")).toEqual({
      command: "pnpm",
      args: ["install"],
      shell: true,
    });
  });
});

describe("quoteForCmd", () => {
  it("keeps an argument with spaces in one piece", () => {
    expect(quoteForCmd("Folded into core.")).toBe('"Folded into core."');
    expect(quoteForCmd('say "hi"')).toBe('"say ""hi"""');
    expect(quoteForCmd("")).toBe('""');
  });
});
