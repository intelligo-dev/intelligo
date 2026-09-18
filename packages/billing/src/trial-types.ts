/**
 * Trial grants live in the plan registry: products register their own
 * with `registerTrialConfig()`, and a product that registers none gets
 * `NO_TRIAL`.
 */
export { getTrialConfig, NO_TRIAL } from "./plan-registry";
export type { TrialConfig } from "./plan-registry";

export type TrialStatus = {
  hasTrialCredits: boolean;
  status: "active" | "depleted" | "converted" | "expired" | "none";
  creditsRemaining: number;
  creditsUsed: number;
  initialCredits: number;
  percentageRemaining: number;
  warningTriggered: boolean;
  trialEndDate: Date | null;
  daysRemaining: number;
  isExpired: boolean;
};
