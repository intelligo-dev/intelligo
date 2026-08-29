/**
 * Validation-only unit tests for the identity service.
 *
 * These exercise checks that run BEFORE any database call — `db` is a
 * lazily-initialized proxy (see ../db/client.ts) that throws only on
 * first actual query, so a test that never reaches the query can
 * safely import the real service without DATABASE_URL or mocking.
 * Everything past validation (ownership scoping, actual persistence,
 * the audit write) is covered by service.integration.test.ts against a
 * real database.
 */

import { describe, it, expect } from "vitest";
import { deleteFact } from "./service";
import { isIdentityServiceError } from "./errors";

const actor = { workspaceId: "ws-1", userId: "u-1" };

describe("deleteFact — input validation", () => {
  it("rejects an empty factId with invalid_input", async () => {
    await expect(deleteFact(actor, "   ")).rejects.toSatisfy((err: unknown) => {
      return isIdentityServiceError(err) && err.code === "invalid_input";
    });
  });
});
