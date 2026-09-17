import "server-only";

/**
 * Your composition root.
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
  registerProductPlans(PRODUCT_SLUG, PLANS);
  registerProductFeatures(PRODUCT_SLUG, FEATURES);

  // What each model costs. The framework ships a catalogue as data and
  // registers none of it: an id with no registered price throws where
  // the price is needed, rather than being guessed. Swap in your own
  // contracted rates, or add a model the framework has never heard of,
  // by passing your own array here.
  registerModels(DEFAULT_MODELS);

  // What you bill in. Provider prices are USD, so a USD deployment
  // converts at exactly 1.0; selling in another currency means stating
  // its rate per USD here, in micros. There is no default rate — a
  // framework that guesses one is inventing money. Seeds the row once;
  // an existing row is left alone, because changing the currency under
  // a ledger that holds balances is your decision, not a deploy's.
  void ensureBillingSettingsRow({
    currency: "USD",
    usdRateMicros: 1_000_000,
    marginBp: DEFAULT_MARGIN_BP,
  });
}

export const executions = createExecutions({
  async checkEntitlement({ workspaceId, requestId, model }) {
    // Passing requestId makes admission atomic: the worst-case cost is
    // reserved in the same transaction that reads the balance, so
    // concurrent requests cannot all pass.
    const quota = await reserveQuota(workspaceId, { modelId: model, requestId });
    return {
      allowed: quota.allowed,
      code: quota.code,
      reason: quota.reason,
      // The hold, as an amount with its currency.
      estimated: quota.estimated,
      usingTrialCredits: quota.usingTrialCredits,
    };
  },

  async settleUsage(s) {
    // Returns what was charged and which pool funded it; the lifecycle
    // records the amount and its currency on the execution row.
    return recordTokenUsage({
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

  // Lets executions.reconcile() tell a settling row whose charge
  // committed from one whose charge never happened.
  findSettlement: ({ workspaceId, requestId }) =>
    findSettlementByRequestId(workspaceId, requestId),
});
