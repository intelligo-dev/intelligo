import { describe, it, expect } from "vitest";
import { IdentityServiceError, isIdentityServiceError } from "./errors";

describe("IdentityServiceError", () => {
  it("carries its code and name", () => {
    const err = new IdentityServiceError("not_found", "Fact not found");
    expect(err.code).toBe("not_found");
    expect(err.name).toBe("IdentityServiceError");
    expect(err.message).toBe("Fact not found");
    expect(err).toBeInstanceOf(Error);
  });

  it("preserves cause when provided", () => {
    const cause = new Error("underlying");
    const err = new IdentityServiceError("database_error", "boom", { cause });
    expect(err.cause).toBe(cause);
  });

  it("isIdentityServiceError narrows unknown values", () => {
    const err = new IdentityServiceError("invalid_input", "nope");
    expect(isIdentityServiceError(err)).toBe(true);
    expect(isIdentityServiceError(new Error("plain"))).toBe(false);
    expect(isIdentityServiceError("not an error")).toBe(false);
  });
});
