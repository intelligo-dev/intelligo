import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-request": "from-next" }),
}));

import { nextRequestContext } from "./index";

describe("nextRequestContext", () => {
  it("reads the current request's headers from Next's request scope", async () => {
    const headers = await nextRequestContext();
    expect(headers.get("x-request")).toBe("from-next");
  });
});
