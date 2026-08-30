import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateEnv, assertEnv } from "./env";

describe("validateEnv", () => {
  beforeEach(() => {
    // Stub all required env vars
    vi.stubEnv("DATABASE_URL", "postgresql://test");
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "test-secret-padded-to-thirty-two-chars-long"
    );
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NODE_ENV", "development");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns valid when all required vars are set", () => {
    const result = validateEnv();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns error for missing DATABASE_URL", () => {
    vi.stubEnv("DATABASE_URL", "");
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("DATABASE_URL"))).toBe(true);
  });

  it("returns error for missing BETTER_AUTH_SECRET", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("BETTER_AUTH_SECRET"))).toBe(
      true
    );
  });

  it("accepts the legacy AUTH_SECRET alias with a warning", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "legacy-secret-padded-to-thirty-two-chars-x");
    const result = validateEnv();
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("legacy alias"))).toBe(true);
  });

  it("returns error for missing NEXT_PUBLIC_APP_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("NEXT_PUBLIC_APP_URL"))).toBe(
      true
    );
  });

  it("returns warnings for missing optional vars", () => {
    // Explicitly clear the optional var: CI sets a dummy OPENAI_API_KEY
    // for the Next.js build, and reading ambient env made this the one
    // test that passed locally and failed there.
    vi.stubEnv("OPENAI_API_KEY", "");

    const result = validateEnv();

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("OPENAI_API_KEY"))).toBe(
      true
    );
  });

  it("warns about test Stripe key in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc123");
    const result = validateEnv();
    expect(result.warnings.some((w) => w.includes("test key"))).toBe(true);
  });

  it("does not warn about Stripe test key in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc123");
    const result = validateEnv();
    expect(result.warnings.some((w) => w.includes("test key"))).toBe(false);
  });
});

describe("assertEnv", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://test");
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "test-secret-padded-to-thirty-two-chars-long"
    );
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not throw when all required vars are set", () => {
    expect(() => assertEnv()).not.toThrow();
  });

  it("throws when required vars are missing", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => assertEnv()).toThrow("Missing");
  });
});
