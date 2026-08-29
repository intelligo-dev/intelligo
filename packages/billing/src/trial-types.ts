/**
 * Trial Types and Configuration
 *
 * Shared types and constants for the trial credits system.
 */

/**
 * The grant itself moved to the plan registry (ADR-0006).
 *
 * `TRIAL_CONFIG` was "100,000 tokens / 5,000₮ / 14 days" hardcoded
 * here: the vertical's pricing-page offer inside a package headed for
 * publication. Products register their own with
 * `registerTrialConfig()`; a product that registers none gets
 * `NO_TRIAL`, because a framework inventing a free grant is giving
 * away money it does not own.
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
