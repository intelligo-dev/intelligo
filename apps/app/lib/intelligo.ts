import "server-only";

/**
 * The reference application's composition root.
 *
 * Deliberately the same shape as a real product's: register the product's
 * plans and features, tell the billing engine which product it is
 * serving, and bind the execution boundary's ports. If this file has
 * to do anything a product's does not — or reach into a package's
 * internals to do it — that is a boundary defect worth fixing in the
 * package rather than working around here.
 */

import {
  ensureBillingSettingsRow,
  reserveQuota,
  recordTokenUsage,
  releaseReservation,
  findSettlementByRequestId,
} from "@intelligo-dev/billing";
import { DEFAULT_MARGIN_BP } from "@intelligo-dev/executions/pricing";
import {
  registerProductFeatures,
  registerProductPlans,
  setDefaultProductSlug,
} from "@intelligo-dev/billing/plans";
import { assertEnv } from "@intelligo-dev/core/env";
import { setRequestContextSource } from "@intelligo-dev/core/request-context";
import {
  DEFAULT_MODELS,
  createExecutions,
  registerModels,
} from "@intelligo-dev/executions";
import { nextRequestContext } from "@intelligo-dev/next";

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

  // Where the framework reads the incoming request's headers from.
  // Only this line knows the app is a Next.js one; `@intelligo-dev/auth`
  // asks `@intelligo-dev/core/request-context` and stays usable from a
  // worker or a test.
  setRequestContextSource(nextRequestContext);

  setDefaultProductSlug(PRODUCT_SLUG);
  registerProductPlans(PRODUCT_SLUG, REFERENCE_PLANS);
  registerProductFeatures(PRODUCT_SLUG, REFERENCE_FEATURES);

  // What each model costs. The catalogue the framework ships is data,
  // not a default: nothing self-registers, so a deployment always knows
  // which prices it is billing against, and can register its own
  // contracted rates — or a model the framework has never heard of.
  registerModels(DEFAULT_MODELS);

  // What this deployment bills in. There is no default rate: provider
  // prices are USD, so a USD deployment converts at exactly 1.0, and
  // one selling in another currency states its own rate here. Seeds the
  // settings row once; an existing row is left alone, because changing
  // the currency under a ledger that already holds balances is an
  // operator's decision, not a deploy's.
  void ensureBillingSettingsRow({
    currency: "USD",
    usdRateMicros: 1_000_000,
    marginBp: DEFAULT_MARGIN_BP,
  });
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
      estimated: quota.estimated,
      usingTrialCredits: quota.usingTrialCredits,
    };
  },

  async settleUsage(settlement) {
    // Returns what was charged and which pool funded it; the lifecycle
    // records the amount and its currency on the execution row.
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
