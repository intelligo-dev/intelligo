/**
 * Quota Types and Constants
 *
 * Shared types for the quota enforcement system.
 */

export const GRACE_OVERAGE_PERCENTAGE = 0.05;

export type QuotaCheckResult = {
  allowed: boolean;
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
