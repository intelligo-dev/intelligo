import "server-only";

/**
 * What the chat page knows about the caller's credit before they type.
 *
 * The transport already refuses a turn it cannot fund — admission runs
 * inside `executions.begin()` and answers 402. That is the correct
 * enforcement point and the wrong place to *tell someone*: by then they
 * have written a message and watched it fail. This is the read that
 * lets the page say so first — an estimate, never a reservation, priced
 * against the model a turn would run on.
 */

import { getChatQuotaState as readChatQuotaState } from "@intelligo-dev/chat";
import type { ChatQuotaState } from "@intelligo-dev/chat/client";

import { CHAT_MODEL_ID } from "@/lib/chat-model";

export type { ChatQuotaState };

/** Never throws: a quota read that fails costs the reader a banner, not the conversation. */
export function getChatQuotaState(): Promise<ChatQuotaState | null> {
  return readChatQuotaState({
    modelId: CHAT_MODEL_ID,
    upgradeHref: "/pricing",
  });
}
