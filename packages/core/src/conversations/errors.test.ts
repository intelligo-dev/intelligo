import { describe, it, expect } from "vitest";
import { ConversationServiceError, isConversationServiceError } from "./errors";

describe("ConversationServiceError", () => {
  it("carries its code and name", () => {
    const err = new ConversationServiceError(
      "not_found",
      "Conversation not found"
    );
    expect(err.code).toBe("not_found");
    expect(err.name).toBe("ConversationServiceError");
    expect(err.message).toBe("Conversation not found");
    expect(err).toBeInstanceOf(Error);
  });

  it("preserves cause when provided", () => {
    const cause = new Error("underlying");
    const err = new ConversationServiceError("database_error", "boom", {
      cause,
    });
    expect(err.cause).toBe(cause);
  });

  it("isConversationServiceError narrows unknown values", () => {
    const err = new ConversationServiceError("forbidden", "nope");
    expect(isConversationServiceError(err)).toBe(true);
    expect(isConversationServiceError(new Error("plain"))).toBe(false);
    expect(isConversationServiceError("not an error")).toBe(false);
  });
});
