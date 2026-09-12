import "server-only";

/**
 * The reference application's composition root (ADR-0005).
 *
 * Deliberately the same shape as a real product's: register the product's
 * plans and features, tell the billing engine which product it is
 * serving, and bind the execution boundary's ports. If this file has
 * to do anything a product's does not — or reach into a package's
 * internals to do it — that is a boundary defect worth fixing in the
 * package rather than working around here.
 */

import {
  reserveQuota,
  recordTokenUsage,
  releaseReservation,
  findSettlementByRequestId,
} from "@intelligo-dev/billing";
import {
  registerProductFeatures,
  registerProductPlans,
  setDefaultProductSlug,
} from "@intelligo-dev/billing/plans";
import { assertEnv } from "@intelligo-dev/core/env";
import {
  DEFAULT_MODELS,
  createExecutions,
  registerModels,
} from "@intelligo-dev/executions";

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

  // Fail on the first request rather than on the first query: a
  // missing DATABASE_URL or auth secret is a configuration error, not
  // something to discover deep inside a handler.
  assertEnv();

  setDefaultProductSlug(PRODUCT_SLUG);
  registerProductPlans(PRODUCT_SLUG, REFERENCE_PLANS);
  registerProductFeatures(PRODUCT_SLUG, REFERENCE_FEATURES);

  // What each model costs. The catalogue the framework ships is data,
  // not a default: nothing self-registers, so a deployment always knows
  // which prices it is billing against, and can register its own
  // contracted rates — or a model the framework has never heard of.
  registerModels(DEFAULT_MODELS);
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

  // Lets executions.reconcile() tell a settling row whose charge
  // committed from one whose charge never happened.
  findSettlement: ({ workspaceId, requestId }) =>
    findSettlementByRequestId(workspaceId, requestId),
});
