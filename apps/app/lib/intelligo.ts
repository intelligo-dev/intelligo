import "server-only";

/**
 * The reference application's composition root (ADR-0005).
 *
 * Deliberately the same shape as Acme's: register the product's
 * plans and features, tell the billing engine which product it is
 * serving, and bind the execution boundary's ports. If this file has
 * to do anything Acme's does not — or reach into a package's
 * internals to do it — that is a boundary defect worth fixing in the
 * package rather than working around here.
 */

import {
  reserveQuota,
  recordTokenUsage,
  releaseReservation,
} from "@intelligo-dev/billing";
import {
  registerProductFeatures,
  registerProductPlans,
  setDefaultProductSlug,
} from "@intelligo-dev/billing/plans";
import { createExecutions } from "@intelligo-dev/executions";

import { REFERENCE_FEATURES, REFERENCE_PLANS } from "./plans";

export const PRODUCT_SLUG = "reference";

export const CAPABILITIES = {
  /** One turn of the generic assistant. */
  assistantMessage: "assistant.message",
} as const;

let composed = false;

export function composeIntelligo(): void {
  if (composed) return;
  composed = true;

  setDefaultProductSlug(PRODUCT_SLUG);
  registerProductPlans(PRODUCT_SLUG, REFERENCE_PLANS);
  registerProductFeatures(PRODUCT_SLUG, REFERENCE_FEATURES);
}

export const executions = createExecutions({
  async checkEntitlement({ workspaceId, requestId, model }) {
    const quota = await reserveQuota(workspaceId, {
      modelId: model,
      requestId,
    });
    return {
      allowed: quota.allowed,
      code: quota.code,
      reason: quota.reason,
      estimatedMnt: quota.estimatedMnt,
      usingTrialCredits: quota.usingTrialCredits,
    };
  },

  async settleUsage(settlement) {
    // Returns what was charged and which pool funded it; the lifecycle
    // records chargedMnt on the execution row.
    return recordTokenUsage({
      workspaceId: settlement.workspaceId,
      userId: settlement.userId ?? "",
      model: settlement.model ?? "unknown",
      agent: settlement.capability,
      inputTokens: settlement.inputTokens,
      outputTokens: settlement.outputTokens,
      totalTokens: settlement.totalTokens,
      usingTrialCredits: settlement.usingTrialCredits,
      requestId: settlement.requestId,
      metadata: settlement.metadata,
    });
  },

  async releaseHold({ requestId }) {
    await releaseReservation(requestId);
  },
});
