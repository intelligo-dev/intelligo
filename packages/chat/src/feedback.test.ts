import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  voteMessage: vi.fn(),
  clearVote: vi.fn(),
}));

class FakeError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

vi.mock("@intelligo-dev/core/conversations", () => ({
  voteMessage: mocks.voteMessage,
  clearVote: mocks.clearVote,
  isConversationServiceError: (e: unknown) => e instanceof FakeError,
}));

import { recordChatFeedback } from "./feedback";

const actor = { workspaceId: "ws-1", userId: "u-1" };
const params = { conversationId: "c-1", messageId: "m-1" };

afterEach(() => vi.clearAllMocks());

describe("recordChatFeedback", () => {
  it("writes a vote and tells the feedback hook once", async () => {
    const feedback = vi.fn();
    const result = await recordChatFeedback({ onTurn: { feedback } }, actor, {
      ...params,
      vote: "up",
    });
    expect(result).toEqual({ ok: true });
    expect(mocks.voteMessage).toHaveBeenCalledWith(actor, {
      chatId: "c-1",
      messageId: "m-1",
      type: "up",
    });
    expect(feedback).toHaveBeenCalledWith({ actor, ...params, vote: "up" });
  });

  it("clears a vote for null", async () => {
    await recordChatFeedback({}, actor, { ...params, vote: null });
    expect(mocks.clearVote).toHaveBeenCalledWith(actor, {
      chatId: "c-1",
      messageId: "m-1",
    });
  });

  it("maps a missing or foreign message to not_found and never throws from the hook", async () => {
    mocks.voteMessage.mockRejectedValueOnce(new FakeError("forbidden"));
    expect(
      await recordChatFeedback({}, actor, { ...params, vote: "down" })
    ).toEqual({ ok: false, code: "not_found" });

    mocks.voteMessage.mockResolvedValueOnce(undefined);
    const feedback = vi.fn().mockRejectedValue(new Error("telemetry down"));
    expect(
      await recordChatFeedback({ onTurn: { feedback } }, actor, {
        ...params,
        vote: "down",
      })
    ).toEqual({ ok: true });
  });
});
