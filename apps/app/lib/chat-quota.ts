import "server-only";

/**
 * What the chat page knows about the caller's credit before they type.
 *
 * The route already refuses a turn it cannot fund — admission runs
 * inside `executions.begin()` and answers 402. That is the correct
 * enforcement point and the wrong place to *tell someone*: by then they
 * have written a message and watched it fail.
 *
 * This is the read that lets the page say so first. It is deliberately
 * an estimate and never a reservation: `estimateQuota` opens no
 * transaction and holds no credit, so rendering a page cannot consume
 * any.
 *
 * Denominated in credits, not currency. The ledger unit is what the
 * balance and the estimate are both in; converting it to money for a
 * banner would need an exchange rate the page has no business
 * choosing.
 */

import { requireWorkspace } from "@intelligo-dev/auth";
import { estimateQuota } from "@intelligo-dev/billing";
import { createLogger } from "@intelligo-dev/core/logger";

import { CHAT_MODEL_ID } from "@/lib/chat-model";

const log = createLogger("ChatQuota");

export type ChatQuotaState = {
  /** False when the next turn would be refused. */
  allowed: boolean;
  /** Why, when the engine refused — already localized by the caller's transport. */
  reason: string | null;
  /** Typed refusal, for a UI that wants to distinguish them. */
  code: string | null;
  /** Credits left across every pool. */
  remaining: number;
  /** Worst-case credits one turn could cost. */
  estimated: number;
  /** Where "upgrade" and "top up" should go. */
  upgradeHref: string;
};

/**
 * Never throws: the page renders with or without this. A quota read
 * that fails should cost the reader a banner, not the conversation.
 */
export async function getChatQuotaState(): Promise<ChatQuotaState | null> {
  try {
    const { workspace } = await requireWorkspace();
    const quota = await estimateQuota(workspace.id, {
      modelId: CHAT_MODEL_ID,
    });

    return {
      allowed: quota.allowed,
      reason: quota.reason ?? null,
      code: quota.code ?? null,
      remaining: quota.remainingMnt ?? 0,
      estimated: quota.estimatedMnt ?? 0,
      upgradeHref: "/pricing",
    };
  } catch (error) {
    log.warn("quota state unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
