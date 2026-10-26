/**
 * Checks that run before any database call. `db` is a lazy proxy that throws
 * only on its first query, so these import the real service without
 * DATABASE_URL; persistence is covered by service.integration.test.ts.
 */

import { describe, it, expect } from "vitest";
import {
  confirmFact,
  deleteFact,
  recordFact,
  saveProfileSnapshot,
} from "./service";
import { isIdentityServiceError } from "./errors";

const actor = { workspaceId: "ws-1", userId: "u-1" };

describe("deleteFact — input validation", () => {
  it("rejects an empty factId with invalid_input", async () => {
    await expect(deleteFact(actor, "   ")).rejects.toSatisfy((err: unknown) => {
      return isIdentityServiceError(err) && err.code === "invalid_input";
    });
  });
});

describe("recordFact and confirmFact — input validation", () => {
  const invalid = (err: unknown) =>
    isIdentityServiceError(err) && err.code === "invalid_input";
  const fact = {
    category: "skill",
    key: "sql",
    value: "SQL",
    confidence: 0.8,
    extractionMethod: "llm_extraction",
  } as const;

  it.each([
    ["an empty key", { key: "  " }],
    ["a category outside the list", { category: "hobby" }],
    ["a method outside the list", { extractionMethod: "guess" }],
    ["a confidence above 1", { confidence: 1.2 }],
    ["a negative confidence", { confidence: -0.1 }],
    ["a confidence that is not a number", { confidence: Number.NaN }],
    ["a fractional importance", { importance: 2.5 }],
    ["no value", { value: undefined }],
    ["a null value", { value: null }],
  ])("recordFact rejects %s with invalid_input", async (_, override) => {
    await expect(
      recordFact(actor, { ...fact, ...override } as never)
    ).rejects.toSatisfy(invalid);
  });

  it("confirmFact rejects an empty id or a confidence outside 0 to 1", async () => {
    await expect(confirmFact(actor, " ")).rejects.toSatisfy(invalid);
    await expect(
      confirmFact(actor, "fact-1", { confidence: 2 })
    ).rejects.toSatisfy(invalid);
  });
});

describe("saveProfileSnapshot — input validation", () => {
  const invalid = (err: unknown) =>
    isIdentityServiceError(err) && err.code === "invalid_input";

  it("rejects an empty summary with invalid_input", async () => {
    await expect(
      saveProfileSnapshot(actor, { summary: "  ", factsDigest: {} })
    ).rejects.toSatisfy(invalid);
  });

  it("rejects a missing digest with invalid_input", async () => {
    await expect(
      saveProfileSnapshot(actor, { summary: "Profile.", factsDigest: null })
    ).rejects.toSatisfy(invalid);
  });
});
