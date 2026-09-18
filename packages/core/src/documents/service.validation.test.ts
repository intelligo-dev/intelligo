/**
 * Checks that run before any database call. `db` is a lazy proxy that throws
 * only on its first query, so these import the real service without
 * DATABASE_URL; persistence is covered by service.integration.test.ts.
 */

import { describe, it, expect } from "vitest";
import { deleteDocumentVersions } from "./service";
import { isDocumentServiceError } from "./errors";

const actor = { workspaceId: "ws-1", userId: "u-1" };

describe("deleteDocumentVersions — input validation", () => {
  it("rejects an unparsable timestamp with invalid_input", async () => {
    await expect(
      deleteDocumentVersions(actor, "doc-1", "not-a-date")
    ).rejects.toSatisfy((err: unknown) => {
      return isDocumentServiceError(err) && err.code === "invalid_input";
    });
  });

  it("rejects a timestamp older than the delete window with invalid_input", async () => {
    const tooOld = new Date(
      Date.now() - 31 * 24 * 60 * 60 * 1000
    ).toISOString();

    await expect(
      deleteDocumentVersions(actor, "doc-1", tooOld)
    ).rejects.toSatisfy((err: unknown) => {
      return isDocumentServiceError(err) && err.code === "invalid_input";
    });
  });
});
