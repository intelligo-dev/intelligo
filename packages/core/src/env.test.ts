import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateEnv, assertEnv } from "./env";

describe("validateEnv", () => {
  beforeEach(() => {
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
    vi.stubEnv("STRIPE_SECRET_KEY", "");

    const result = validateEnv();

    expect(result.warnings.some((w) => w.includes("STRIPE_SECRET_KEY"))).toBe(
      true
    );
  });

  it("names every unset optional var in one warning", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "");

    const optional = validateEnv().warnings.filter((w) =>
      w.startsWith("Optional env vars not set")
    );

    expect(optional).toHaveLength(1);
    expect(optional[0]).toContain("STRIPE_SECRET_KEY");
    expect(optional[0]).toContain("RESEND_API_KEY");
  });

  it("does not warn about variables the framework never reads", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");

    const { warnings } = validateEnv();

    expect(warnings.some((w) => w.includes("OPENAI_API_KEY"))).toBe(false);
    expect(
      warnings.some((w) => w.includes("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"))
    ).toBe(false);
  });

  it("warns when Resend is configured without a sender", () => {
    vi.stubEnv("EMAIL_PROVIDER", "");
    vi.stubEnv("RESEND_API_KEY", "re_key");
    vi.stubEnv("EMAIL_FROM", "");
    expect(validateEnv().warnings.some((w) => w.includes("EMAIL_FROM"))).toBe(
      true
    );

    vi.stubEnv("EMAIL_FROM", "Acme <noreply@acme.com>");
    expect(validateEnv().warnings.some((w) => w.includes("EMAIL_FROM"))).toBe(
      false
    );
  });

  it("does not ask for a sender when Loops sends the email", () => {
    vi.stubEnv("RESEND_API_KEY", "re_key");
    vi.stubEnv("LOOPS_API_KEY", "loops-key");
    vi.stubEnv("EMAIL_PROVIDER", "loops");
    vi.stubEnv("EMAIL_FROM", "");
    expect(validateEnv().warnings.some((w) => w.includes("EMAIL_FROM"))).toBe(
      false
    );
  });

  it("warns about a non-https app URL in production only", () => {
    const flagged = () =>
      validateEnv().warnings.some((w) => w.includes("not an https URL"));

    expect(flagged()).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(flagged()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    expect(flagged()).toBe(false);
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
