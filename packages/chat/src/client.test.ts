import { describe, expect, it } from "vitest";

import { parseChatError } from "./client";

describe("parseChatError", () => {
  it("reads the transport's refusal from the error useChat surfaces", () => {
    const error = new Error(
      JSON.stringify({
        error: "Out of credit",
        code: "QUOTA_EXCEEDED",
        reasonCode: "allowance_depleted",
      })
    );
    expect(parseChatError(error)).toEqual({
      error: "Out of credit",
      code: "QUOTA_EXCEEDED",
      reasonCode: "allowance_depleted",
    });
  });

  it("is null for anything that is not one of ours", () => {
    expect(parseChatError(new Error("<html>502</html>"))).toBeNull();
    expect(
      parseChatError(new Error(JSON.stringify({ error: "x", code: "NOPE" })))
    ).toBeNull();
    expect(parseChatError(undefined)).toBeNull();
  });
});
