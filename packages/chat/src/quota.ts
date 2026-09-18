/**
 * What the chat page knows about the caller's credit before they type, so
 * it can say so before a turn is refused with 402. An estimate, never a
 * reservation: rendering a page cannot consume credit.
 */

import { requireWorkspace } from "@intelligo-dev/auth";
import { estimateQuota } from "@intelligo-dev/billing";
import { createLogger } from "@intelligo-dev/core/logger";

import type { ChatQuotaState } from "./client";

const log = createLogger("ChatQuota");

/**
 * Never throws: the page renders with or without this. A quota read
 * that fails should cost the reader a banner, not the conversation.
 */
export async function getChatQuotaState(options: {
  /** The model a turn would run on — what the estimate is priced against. */
  modelId: string;
  /** Where "upgrade" and "top up" should go. */
  upgradeHref: string;
  /** Defaults to the request's workspace. */
  workspaceId?: string;
}): Promise<ChatQuotaState | null> {
  try {
    const workspaceId =
      options.workspaceId ?? (await requireWorkspace()).workspace.id;
    const quota = await estimateQuota(workspaceId, {
      modelId: options.modelId,
    });
    return {
      allowed: quota.allowed,
      reason: quota.reason ?? null,
      code: quota.code ?? null,
      // Micros of the deployment's billing currency.
      remaining: quota.remaining?.amount ?? 0,
      estimated: quota.estimated?.amount ?? 0,
      upgradeHref: options.upgradeHref,
    };
  } catch (error) {
    log.warn("quota state unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
