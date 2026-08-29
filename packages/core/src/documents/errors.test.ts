import { describe, it, expect } from "vitest";
import { DocumentServiceError, isDocumentServiceError } from "./errors";

describe("DocumentServiceError", () => {
  it("carries its code and name", () => {
    const err = new DocumentServiceError("not_found", "Document not found");
    expect(err.code).toBe("not_found");
    expect(err.name).toBe("DocumentServiceError");
    expect(err.message).toBe("Document not found");
    expect(err).toBeInstanceOf(Error);
  });

  it("preserves cause when provided", () => {
    const cause = new Error("underlying");
    const err = new DocumentServiceError("database_error", "boom", { cause });
    expect(err.cause).toBe(cause);
  });

  it("isDocumentServiceError narrows unknown values", () => {
    const err = new DocumentServiceError("forbidden", "nope");
    expect(isDocumentServiceError(err)).toBe(true);
    expect(isDocumentServiceError(new Error("plain"))).toBe(false);
    expect(isDocumentServiceError("not an error")).toBe(false);
  });
});
