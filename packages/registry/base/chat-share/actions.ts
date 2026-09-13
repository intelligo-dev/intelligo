"use server";

/**
 * The public read of a shared conversation. No actor: the reader is
 * anyone with the link. What they get is decided by `sanitizeForShare`
 * (`@intelligo-dev/chat`) — the transcript minus reasoning, tool
 * details, provider metadata, transient parts and file URLs. A product
 * that wants a named tool's output on the page passes a policy here.
 */

import { sanitizeForShare, toUIMessages } from "@intelligo-dev/chat";
import type { UIMessage } from "ai";
import {
  getPublicConversation,
  getPublicMessages,
  isConversationServiceError,
} from "@intelligo-dev/core/conversations";

export type SharedConversation = {
  id: string;
  title: string | null;
  updatedAt: string;
  messages: UIMessage[];
};

export async function loadSharedConversation(
  id: string
): Promise<SharedConversation | null> {
  try {
    const conversation = await getPublicConversation(id);
    const rows = await getPublicMessages(id);
    return {
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt.toISOString(),
      messages: sanitizeForShare(toUIMessages(rows)),
    };
  } catch (error) {
    if (isConversationServiceError(error) && error.code === "not_found") {
      return null;
    }
    throw error;
  }
}
