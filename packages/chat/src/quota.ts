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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readState(
  workspaceId: string,
  modelId: string,
  upgradeHref: string
): Promise<ChatQuotaState> {
  const quota = await estimateQuota(workspaceId, { modelId });
  if (quota.code === "unknown_model") {
    // A deployment error, not the reader's balance: the page shows
    // neutral copy, and this line is where the operator finds out.
    log.error("Model has no registered price", {
      modelId,
      reason: quota.reason,
    });
  }
  return {
    allowed: quota.allowed,
    reason: quota.reason ?? null,
    code: quota.code ?? null,
    // Micros of the deployment's billing currency.
    remaining: quota.remaining?.amount ?? 0,
    estimated: quota.estimated?.amount ?? 0,
    upgradeHref,
  };
}

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
    return await readState(workspaceId, options.modelId, options.upgradeHref);
  } catch (error) {
    log.warn("quota state unavailable", { error: errorMessage(error) });
    return null;
  }
}

/**
 * The same estimate for each model the composer offers, keyed by model
 * id, so the banner can follow the picker: a turn on a dearer model has
 * a larger worst case, and the balance that funds one may not fund the
 * other. Never throws; a model whose read failed is left out.
 */
export async function getChatQuotaStates(options: {
  modelIds: readonly string[];
  /** Where "upgrade" and "top up" should go. */
  upgradeHref: string;
  /** Defaults to the request's workspace. */
  workspaceId?: string;
}): Promise<Record<string, ChatQuotaState>> {
  const modelIds = [...new Set(options.modelIds)];
  if (modelIds.length === 0) return {};
  try {
    const workspaceId =
      options.workspaceId ?? (await requireWorkspace()).workspace.id;
    const entries = await Promise.all(
      modelIds.map(async (modelId) => {
        try {
          return [
            modelId,
            await readState(workspaceId, modelId, options.upgradeHref),
          ] as const;
        } catch (error) {
          log.warn("quota state unavailable", {
            modelId,
            error: errorMessage(error),
          });
          return null;
        }
      })
    );
    return Object.fromEntries(entries.filter((entry) => entry !== null));
  } catch (error) {
    log.warn("quota state unavailable", { error: errorMessage(error) });
    return {};
  }
}
