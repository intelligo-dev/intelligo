import { describe, expect, it } from "vitest";

import { parseCreateFlags } from "./create-flow.js";

describe("parseCreateFlags", () => {
  it("asks for everything when given nothing", () => {
    expect(parseCreateFlags([])).toEqual({
      target: undefined,
      items: undefined,
      all: false,
      yes: false,
      install: true,
      linkWorkspace: false,
    });
  });

  it("reads --items in either spelling without taking the list for the target", () => {
    expect(parseCreateFlags(["--items", "chat, usage", "acme"])).toMatchObject({
      target: "acme",
      items: ["chat", "usage"],
    });
    expect(parseCreateFlags(["acme", "--items=chat"])).toMatchObject({
      target: "acme",
      items: ["chat"],
    });
  });

  it("reads approval and scaffold-only as separate decisions", () => {
    expect(parseCreateFlags(["acme", "-y", "--no-install"])).toMatchObject({
      yes: true,
      install: false,
    });
  });
});
