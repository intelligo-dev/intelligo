/**
 * Checks that run before any database call. `db` is a lazy proxy that throws
 * only on its first query, so these import the real service without
 * DATABASE_URL; persistence is covered by service.integration.test.ts.
 */

import { describe, it, expect } from "vitest";
import { renameConversation, saveMessages, upsertMessages } from "./service";
import { isConversationServiceError } from "./errors";

const actor = { workspaceId: "ws-1", userId: "u-1" };

describe("renameConversation — input validation", () => {
  it("rejects an empty title with invalid_input", async () => {
    await expect(renameConversation(actor, "conv-1", "   ")).rejects.toSatisfy(
      (err: unknown) => {
        return isConversationServiceError(err) && err.code === "invalid_input";
      }
    );
  });

  it("rejects a title over the length cap with invalid_input", async () => {
    const tooLong = "x".repeat(301);
    await expect(
      renameConversation(actor, "conv-1", tooLong)
    ).rejects.toSatisfy((err: unknown) => {
      return isConversationServiceError(err) && err.code === "invalid_input";
    });
  });
});

describe("saveMessages — empty batch short-circuit", () => {
  it("returns an empty array without touching the database", async () => {
    await expect(saveMessages(actor, [])).resolves.toEqual([]);
  });
});

describe("upsertMessages — empty batch short-circuit", () => {
  it("resolves without touching the database", async () => {
    await expect(upsertMessages("conv-1", [])).resolves.toBeUndefined();
  });
});
