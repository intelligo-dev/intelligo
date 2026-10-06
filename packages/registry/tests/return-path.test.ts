/**
 * The post-sign-in destination stays on this site, whatever a link puts
 * in `?next=`.
 */

import { describe, expect, it } from "vitest";

import { returnPath } from "../base/auth-login/lib/auth-validation";

describe("returnPath", () => {
  it.each([
    ["/settings", "/settings"],
    ["/ok?q=1", "/ok?q=1"],
    ["/chat/abc#latest", "/chat/abc#latest"],
    ["/a/../b", "/b"],
  ])("keeps the path %j", (next, expected) => {
    expect(returnPath(next)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "dashboard",
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    "\t//evil.com",
    "/%09/evil.com\u0000",
  ])("falls back to /dashboard for %j", (next) => {
    expect(returnPath(next)).toBe("/dashboard");
  });

  it("returns an encoded control character as a path on this site", () => {
    const result = returnPath("/%09/evil.com");
    expect(new URL(result, "https://app.example").origin).toBe(
      "https://app.example"
    );
  });
});
