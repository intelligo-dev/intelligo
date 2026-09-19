import "server-only";

/**
 * What the chat page knows about the caller's credit before they type.
 *
 * The transport already refuses a turn it cannot fund — admission runs
 * inside `executions.begin()` and answers 402. That is the correct
 * enforcement point and the wrong place to *tell someone*: by then they
 * have written a message and watched it fail. This is the read that
 * lets the page say so first — an estimate, never a reservation, priced
 * against the model a turn would run on: the default, and each model
 * the composer's picker offers, so the banner follows the pick.
 */

import {
  getChatQuotaState as readChatQuotaState,
  getChatQuotaStates as readChatQuotaStates,
} from "@intelligo-dev/chat";
import type { ChatQuotaState } from "@intelligo-dev/chat/client";

import { CHAT_MODEL_ID } from "@/lib/chat-model";

export type { ChatQuotaState };

const UPGRADE_HREF = "/pricing";

/** Never throws: a quota read that fails costs the reader a banner, not the conversation. */
export function getChatQuotaState(
  modelId: string = CHAT_MODEL_ID
): Promise<ChatQuotaState | null> {
  return readChatQuotaState({ modelId, upgradeHref: UPGRADE_HREF });
}

/** The same read per offered model, keyed by model id. Never throws; empty for an empty list. */
export function getChatQuotaStates(
  modelIds: readonly string[]
): Promise<Record<string, ChatQuotaState>> {
  return readChatQuotaStates({ modelIds, upgradeHref: UPGRADE_HREF });
}
