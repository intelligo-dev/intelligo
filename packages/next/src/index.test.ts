import { describe, expect, it, vi } from "vitest";

const after = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-request": "from-next" }),
}));
vi.mock("next/server", () => ({ after }));

import { nextBackgroundTasks, nextRequestContext } from "./index";

describe("nextRequestContext", () => {
  it("reads the current request's headers from Next's request scope", async () => {
    const headers = await nextRequestContext();
    expect(headers.get("x-request")).toBe("from-next");
  });
});

describe("nextBackgroundTasks", () => {
  it("hands the task to Next's after()", () => {
    const task = Promise.resolve();
    nextBackgroundTasks(task);
    expect(after).toHaveBeenCalledWith(task);
  });
});
