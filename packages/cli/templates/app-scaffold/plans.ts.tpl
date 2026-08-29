/**
 * Your plans and feature gates.
 *
 * This file is yours. Intelligo's billing engine knows only the shape;
 * the names, prices, and limits are entirely your product's, and it
 * reads them through the registry your composition root populates
 * (ADR-0006). Two limit keys are special because the credit engine
 * reads them directly: `monthlyCreditMnt` and `rolloverEnabled`.
 */

import type { PlanConfig } from "@intelligo-dev/billing/plans";

export const PLANS: Record<string, PlanConfig> = {
  free: {
    name: "Free",
    slug: "free",
    description: "Get started",
    descriptionMn: "",
    priceOneTime: 0,
    targetAudience: "Everyone",
    aiModelLabel: "Base",
    limits: { monthlyCreditMnt: 2_000, rolloverEnabled: false },
    features: [],
    featuresMn: [],
  },
  pro: {
    name: "Pro",
    slug: "pro",
    description: "For daily use",
    descriptionMn: "",
    priceOneTime: 20_000,
    targetAudience: "Teams",
    aiModelLabel: "Advanced",
    limits: { monthlyCreditMnt: 60_000, rolloverEnabled: true },
    features: [],
    featuresMn: [],
  },
};

/** Which plans grant which feature. An unregistered feature is denied. */
export const FEATURES: Record<string, readonly string[]> = {
  assistant: ["free", "pro"],
};
