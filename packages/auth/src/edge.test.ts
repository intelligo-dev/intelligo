/**
 * The edge guard must stay database-free and driver-agnostic.
 *
 * These tests exist because the previous edge module instantiated
 * Better-Auth against the Neon HTTP driver, which returned HTTP 500 for
 * every request when the database was not Neon. Nothing caught it: the
 * module had no tests, and the failure was masked in development by a
 * NODE_ENV bypass.
 */

import { describe, expect, it } from "vitest";
import { hasSessionCookie } from "./edge";

function req(cookie?: string): Request {
  return new Request("http://localhost:4000/en/dashboard", {
    headers: cookie ? { cookie } : {},
  });
}

describe("hasSessionCookie", () => {
  it("is false with no cookie header at all", () => {
    expect(hasSessionCookie(req())).toBe(false);
  });

  it("is false when unrelated cookies are present", () => {
    expect(hasSessionCookie(req("referral_code=abc; NEXT_LOCALE=en"))).toBe(
      false
    );
  });

  it("is true when the Better-Auth session cookie is present", () => {
    expect(
      hasSessionCookie(req("better-auth.session_token=tok.signature"))
    ).toBe(true);
  });

  it("finds the session cookie among others", () => {
    expect(
      hasSessionCookie(
        req("NEXT_LOCALE=mn; better-auth.session_token=tok.sig; theme=dark")
      )
    ).toBe(true);
  });

  it("makes no network call — an https request without a cookie is still false", () => {
    // A DB-backed implementation would attempt a fetch here and throw.
    const secure = new Request("https://app.example.com/en/dashboard");
    expect(hasSessionCookie(secure)).toBe(false);
  });
});
