import { describe, expect, it } from "vitest";

import { itemNames, unknownFlags, wantsHelp } from "./args";

describe("unknownFlags", () => {
  it("names each flag the command does not accept, wherever it stands", () => {
    expect(
      unknownFlags(["chat", "--chek", "--force", "-x"], ["--check", "--force"])
    ).toEqual(["--chek", "-x"]);
  });

  it("ignores positional arguments", () => {
    expect(unknownFlags(["chat", "usage"], [])).toEqual([]);
  });
});

describe("wantsHelp", () => {
  it("answers --help and -h", () => {
    expect(wantsHelp(["--help"])).toBe(true);
    expect(wantsHelp(["chat", "-h"])).toBe(true);
    expect(wantsHelp(["chat"])).toBe(false);
  });
});

describe("itemNames", () => {
  it("takes comma-separated and space-separated names alike", () => {
    expect(itemNames(["intelligo,smoke", "chat", "--check", "usage,"])).toEqual(
      ["intelligo", "smoke", "chat", "usage"]
    );
  });
});
