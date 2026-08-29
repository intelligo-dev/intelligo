import "server-only";

/**
 * Your composition root (ADR-0005).
 *
 * This file is yours — Intelligo generated it once and will not
 * overwrite it. It is the single place the application wires itself
 * together: which plans exist, which features they grant, and how the
 * execution boundary reaches your billing implementation.
 *
 * Import-side-effect registration is deliberately not used: a
 * registration that silently does not happen looks exactly like one
 * that did.
 */

import {
  checkQuota,
  recordTokenUsage,
  releaseReservation,
} from "@intelligo-dev/billing";
import {
  registerProductFeatures,
  registerProductPlans,
  setDefaultProductSlug,
} from "@intelligo-dev/billing/plans";
import { createExecutions } from "@intelligo-dev/executions";

import { PLANS, FEATURES } from "./plans";

/** Identifies your product to the billing engine. */
export const PRODUCT_SLUG = "__APP_SLUG__";

/**
 * What your product can be asked to do. Capability strings are your
 * vocabulary — Intelligo only groups and meters them.
 */
export const CAPABILITIES = {
  assistantMessage: "assistant.message",
} as const;

let composed = false;

export function composeIntelligo(): void {
  if (composed) return;
  composed = true;

  setDefaultProductSlug(PRODUCT_SLUG);
  registerProductPlans(PRODUCT_SLUG, PLANS);
  registerProductFeatures(PRODUCT_SLUG, FEATURES);
}

export const executions = createExecutions({
  async checkEntitlement({ workspaceId, requestId, model }) {
    // Passing requestId makes admission atomic: the worst-case cost is
    // reserved in the same transaction that reads the balance, so
    // concurrent requests cannot all pass.
    const quota = await checkQuota(workspaceId, { modelId: model, requestId });
    return {
      allowed: quota.allowed,
      reason: quota.reason,
      estimatedMnt: quota.estimatedMnt,
      usingTrialCredits: quota.usingTrialCredits,
    };
  },

  async settleUsage(s) {
    await recordTokenUsage({
      workspaceId: s.workspaceId,
      userId: s.userId ?? "",
      model: s.model ?? "unknown",
      agent: s.capability,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      totalTokens: s.totalTokens,
      usingTrialCredits: s.usingTrialCredits,
      requestId: s.requestId,
      metadata: s.metadata,
    });
  },

  async releaseHold({ requestId }) {
    await releaseReservation(requestId);
  },
});
