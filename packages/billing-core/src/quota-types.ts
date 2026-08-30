/**
 * Quota Types and Constants
 *
 * Shared types for the quota enforcement system.
 */

export const GRACE_OVERAGE_PERCENTAGE = 0.05;

/**
 * Why admission refused. Stable, machine-readable; the `reason` string
 * beside it is for humans and may be localized by the transport.
 *
 * - `insufficient_credits` — some balance remains, but less than the
 *   worst-case cost of one turn on this model.
 * - `allowance_depleted` — nothing remains in any pool.
 * - `billing_not_configured` — no product/plans registered; nothing can
 *   be admitted until the composition root configures billing.
 */
export type QuotaRefusalCode =
  | "insufficient_credits"
  | "allowance_depleted"
  | "billing_not_configured";

export type QuotaCheckResult = {
  allowed: boolean;
  /** Set when `allowed` is false. */
  code?: QuotaRefusalCode;
  reason?: string;
  billingMode: "subscription" | "credit";
  usage: { used: number; limit: number; percentage: number };
  creditBalanceMnt?: number;
  estimatedMnt?: number;
  remainingMnt?: number;
  usingTrialCredits: boolean;
  graceActive: boolean;
  /** Set when admission created a credit reservation for this request. */
  reservedRequestId?: string;
};

/** A read-only estimate: never carries a reservation. */
export type QuotaEstimate = Omit<QuotaCheckResult, "reservedRequestId">;

/**
 * An atomic admission decision. When allowed, `reservedRequestId` is
 * the reservation settlement must release.
 */
export type QuotaAdmission =
  | (QuotaCheckResult & { allowed: true; reservedRequestId: string })
  | (QuotaCheckResult & { allowed: false; code: QuotaRefusalCode });

export type RecordUsageParams = {
  workspaceId: string;
  userId: string;
  model: string;
  agent: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  metadata?: Record<string, unknown>;
  usingTrialCredits?: boolean;
  /**
   * Correlates this settlement with the credit reservation created at
   * admission (checkQuota with the same requestId). Falls back to
   * metadata.requestId when omitted.
   */
  requestId?: string;
};

/**
 * What one settlement charged and which pools funded it.
 * `chargedMnt === planMnt + topupMnt + trialMnt`.
 */
export type SettlementOutcome = {
  chargedMnt: number;
  /** Funded by this period's plan allowance. */
  planMnt: number;
  /** Debited from the top-up balance. */
  topupMnt: number;
  /** Debited from the trial grant. */
  trialMnt: number;
};

export type UsageSummary = {
  currentPeriod: {
    tokensUsed: number;
    requestCount: number;
    limit: number;
    percentage: number;
  };
  byModel: Array<{ model: string; totalTokens: number; requestCount: number }>;
  byAgent: Array<{ agent: string; totalTokens: number; requestCount: number }>;
  daily: Array<{ date: string; totalTokens: number; requestCount: number }>;
};
