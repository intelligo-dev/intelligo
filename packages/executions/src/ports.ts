/**
 * Ports the execution lifecycle depends on.
 *
 * `executions` must not import `billing` — in the target structure
 * entitlement decisions live in `entitlements` and the hold/settle
 * mechanics in `credits`, neither of which exists yet. Rather than
 * bake in a dependency that has to be unwound later, the lifecycle
 * declares what it needs and the composition root binds today's
 * billing implementations to it (ADR-0005).
 *
 * Both ports are optional: with neither bound, executions still record
 * the lifecycle, they just don't gate or charge. That is what the
 * reference app and any non-metered capability want.
 */

import type { Money } from "@intelligo-dev/core/money";

export type EntitlementDecision = {
  allowed: boolean;
  /**
   * Stable, machine-readable refusal code from the entitlement port
   * (e.g. billing's `insufficient_credits`), for transports to map to a
   * status and to localize. Opaque to the lifecycle.
   */
  code?: string;
  /** Human-readable refusal, surfaced to the caller and recorded. */
  reason?: string;
  /**
   * Worst-case charge held for this execution, in MNT.
   *
   * @deprecated Bind `estimated` instead; this is read only while a
   * port still speaks whole tugrik, and goes with migration 0045.
   */
  estimatedMnt?: number;
  /** Worst-case charge held for this execution. Wins over `estimatedMnt`. */
  estimated?: Money;
  /** True when the hold came out of the trial grant. */
  usingTrialCredits?: boolean;
};

export type EntitlementRequest = {
  workspaceId: string;
  userId?: string | null;
  capability: string;
  /** Correlates the hold with settlement. */
  requestId: string;
  model?: string;
};

export type UsageSettlement = {
  workspaceId: string;
  userId?: string | null;
  requestId: string;
  capability: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  usingTrialCredits: boolean;
  metadata?: Record<string, unknown>;
};

export type SettlementResult = {
  /**
   * Actual amount charged, in MNT, if the port computed one.
   *
   * @deprecated Return `charged` instead; this is read only while a
   * port still speaks whole tugrik, and goes with migration 0045.
   */
  chargedMnt?: number;
  /** What the port actually charged. Wins over `chargedMnt`. */
  charged?: Money;
};

export type SettlementQuery = {
  workspaceId: string;
  requestId: string;
};

export type ExecutionPorts = {
  /**
   * Decide whether this execution may run and hold the worst-case
   * cost. Called before the run; a refusal short-circuits it.
   */
  checkEntitlement?: (
    request: EntitlementRequest
  ) => Promise<EntitlementDecision>;

  /**
   * Record real usage and release the hold. Called at most once per
   * execution: the lifecycle claims the row by compare-and-swap before
   * calling this and never retries it, so the port itself need not be
   * idempotent (the reference binding, `recordTokenUsage`, is not).
   */
  settleUsage?: (
    settlement: UsageSettlement
  ) => Promise<SettlementResult | void>;

  /**
   * Answer "was this request already charged?" for `reconcile()`: a
   * row stuck in `settling` may mean the charge never happened OR that
   * it committed and the process died before the final status flip.
   * Return the charge if one exists, null otherwise. Optional; without
   * it, reconcile cannot tell the two apart and leaves the row alone.
   */
  findSettlement?: (query: SettlementQuery) => Promise<SettlementResult | null>;

  /**
   * Release a hold without charging (run failed before producing
   * usage). Optional: when absent, the hold is left to expire.
   */
  releaseHold?: (input: {
    workspaceId: string;
    requestId: string;
  }) => Promise<void>;
};
