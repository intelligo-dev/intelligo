import "server-only";

/**
 * The models the composer offers — consumer-owned.
 *
 * Empty (the default) means the picker is hidden and every turn runs
 * on `lib/chat-model.ts`'s default. List two or more and the composer
 * shows a picker; the transport refuses anything not on the list, and
 * a model with a `featureKey` only to plans that have it. Every id
 * must be registered in `@intelligo-dev/executions/pricing` — an
 * architecture test holds this file to that.
 *
 *   export const CHAT_MODELS: ChatModelOption[] = [
 *     { id: "google/gemini-2.5-flash", label: "Fast" },
 *     { id: "anthropic/claude-sonnet-4-6", label: "Smart", featureKey: PRO_MODELS },
 *   ];
 *
 * Bind the same list in `lib/chat-server-config.ts` (`models`), which
 * is what makes the server's answer match the composer's offer.
 */

import { hasFeature } from "@intelligo-dev/billing";
import type { ChatModelOption } from "@intelligo-dev/chat/client";

export type { ChatModelOption };

export const CHAT_MODELS: ChatModelOption[] = [];

/** The models this workspace may pick from — the list, minus what its plan lacks. */
export async function getChatModelOptions(
  workspaceId: string
): Promise<ChatModelOption[]> {
  const allowed = await Promise.all(
    CHAT_MODELS.map(async (model) =>
      model.featureKey ? hasFeature(workspaceId, model.featureKey) : true
    )
  );
  return CHAT_MODELS.filter((_, index) => allowed[index]);
}
