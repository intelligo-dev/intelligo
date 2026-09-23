/**
 * Checks that run before any database call. `db` is a lazy proxy that throws
 * only on its first query, so these import the real service without
 * DATABASE_URL; persistence is covered by service.integration.test.ts.
 */

import { describe, it, expect } from "vitest";
import { deleteFact, saveProfileSnapshot } from "./service";
import { isIdentityServiceError } from "./errors";

const actor = { workspaceId: "ws-1", userId: "u-1" };

describe("deleteFact — input validation", () => {
  it("rejects an empty factId with invalid_input", async () => {
    await expect(deleteFact(actor, "   ")).rejects.toSatisfy((err: unknown) => {
      return isIdentityServiceError(err) && err.code === "invalid_input";
    });
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
