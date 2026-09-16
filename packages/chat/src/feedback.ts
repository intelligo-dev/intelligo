/**
 * A reader's verdict on a reply, recorded once and reported once.
 *
 * The registry's `voteMessage` action is two lines over this: the
 * write goes through core's votes table, and the `feedback` hook is
 * the one place telemetry learns about it — the same hook whether the
 * vote came from the page, a panel or a widget.
 */

import {
  clearVote,
  isConversationServiceError,
  voteMessage,
} from "@intelligo-dev/core/conversations";

import type { ChatActor, ChatServerConfig } from "./config";

export type ChatFeedback = "up" | "down" | null;

export type RecordChatFeedbackResult =
  { ok: true } | { ok: false; code: "not_found" | "database_error" };

export async function recordChatFeedback(
  config: Pick<ChatServerConfig, "onTurn">,
  actor: ChatActor,
  params: { conversationId: string; messageId: string; vote: ChatFeedback }
): Promise<RecordChatFeedbackResult> {
  try {
    if (params.vote === null) {
      await clearVote(actor, {
        chatId: params.conversationId,
        messageId: params.messageId,
      });
    } else {
      await voteMessage(actor, {
        chatId: params.conversationId,
        messageId: params.messageId,
        type: params.vote,
      });
    }
  } catch (error) {
    if (
      isConversationServiceError(error) &&
      (error.code === "not_found" || error.code === "forbidden")
    ) {
      return { ok: false, code: "not_found" };
    }
    return { ok: false, code: "database_error" };
  }

  try {
    await config.onTurn?.feedback?.({
      actor,
      conversationId: params.conversationId,
      messageId: params.messageId,
      vote: params.vote,
    });
  } catch {
    // Telemetry must never fail a vote.
  }
  return { ok: true };
}
