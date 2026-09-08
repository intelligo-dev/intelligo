import { describe, it, expect } from "vitest";

import { resolveTrustedOrigins } from "./trusted-origins";

describe("resolveTrustedOrigins", () => {
  it("trusts only the configured app URL when one is set", () => {
    expect(
      resolveTrustedOrigins({
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
        NODE_ENV: "production",
      })
    ).toEqual(["https://app.example.com"]);
  });

  it("does not widen a configured app URL in development", () => {
    expect(
      resolveTrustedOrigins({
        NEXT_PUBLIC_APP_URL: "http://localhost:4002",
        NODE_ENV: "development",
      })
    ).toEqual(["http://localhost:4002"]);
  });

  it("trusts any loopback port in development when the URL is unset", () => {
    // The reference app serves on 4002 and a scaffolded app on 3000;
    // a fixed guess 403s one of them for no discoverable reason.
    const origins = resolveTrustedOrigins({ NODE_ENV: "development" });
    expect(origins).toContain("http://localhost:*");
    expect(origins).toContain("http://127.0.0.1:*");
    expect(
      origins.every((o) => /^http:\/\/(localhost|127\.0\.0\.1):/.test(o))
    ).toBe(true);
  });

  it("fails closed in production when the URL is unset", () => {
    expect(resolveTrustedOrigins({ NODE_ENV: "production" })).toEqual([]);
  });
});
