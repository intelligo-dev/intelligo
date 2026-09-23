/**
 * The execution boundary bound to this billing engine.
 *
 * `@intelligo-dev/executions` declares ports — admission, settlement,
 * release, settlement lookup — and every app that bills through this
 * package binds them the same way. Written once here, so an app's
 * composition root says `createBillingExecutions()` instead of copying
 * the binding, and a fix to it reaches every app with the next release.
 */

import {
  createExecutions,
  type ExecutionPorts,
} from "@intelligo-dev/executions";

import {
  findSettlementByRequestId,
  recordTokenUsage,
  releaseReservation,
  reserveQuota,
} from "./quota";

/** The four execution ports, bound to the quota and credit engine. */
export function billingExecutionPorts(): Required<ExecutionPorts> {
  return {
    async checkEntitlement({ workspaceId, requestId, model }) {
      // Passing requestId makes admission atomic: the worst-case cost
      // is reserved in the same transaction that reads the balance, so
      // concurrent requests cannot all pass.
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

    // Records usage, settles the reservation and deducts credits in one
    // transaction; idempotent per requestId.
    settleUsage: (s) =>
      recordTokenUsage({
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
      }),

    async releaseHold({ requestId }) {
      await releaseReservation(requestId);
    },

    // Lets reconcile() tell a settling row whose charge committed from
    // one whose charge never happened.
    findSettlement: ({ workspaceId, requestId }) =>
      findSettlementByRequestId(workspaceId, requestId),
  };
}

/**
 * `createExecutions` over the billing ports. Pass a port to replace the
 * default one (a product that meters elsewhere, a test double).
 */
export function createBillingExecutions(overrides: ExecutionPorts = {}) {
  return createExecutions({ ...billingExecutionPorts(), ...overrides });
}
