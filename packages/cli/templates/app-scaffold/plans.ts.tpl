/**
 * Your plans and feature gates.
 *
 * This file is yours. Intelligo's billing engine knows only the shape;
 * the names, prices, and limits are entirely your product's, and it
 * reads them through the registry your composition root populates
 * (ADR-0006). `monthlyAllowance` is what the credit engine enforces:
 * an amount with its currency, which must be the one your composition
 * root declares to `ensureBillingSettingsRow`. `rolloverEnabled` in
 * `limits` is read directly too.
 */

import { fromMajor } from "@intelligo-dev/core/money";
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
    /** Half a dollar of model time a month — roughly a hundred cheap turns. */
    monthlyAllowance: fromMajor(0.5, "USD"),
    limits: { rolloverEnabled: false },
    features: [],
    featuresMn: [],
  },
  pro: {
    name: "Pro",
    slug: "pro",
    description: "For daily use",
    descriptionMn: "",
    priceOneTime: 20,
    targetAudience: "Teams",
    aiModelLabel: "Advanced",
    /** $15 of model time inside a $20 plan. */
    monthlyAllowance: fromMajor(15, "USD"),
    limits: { rolloverEnabled: true },
    features: [],
    featuresMn: [],
  },
};

/**
 * Which plans grant which feature. An unregistered feature is denied —
 * a registry item whose `featureKey` is missing here returns 403 on
 * every request, so add the key when you install the item.
 */
export const FEATURES: Record<string, readonly string[]> = {
  assistant: ["free", "pro"],
  // POST /api/chat (the `chat` registry item). Every plan, so a clean
  // install can chat with no configuration; tighten to ["pro"] to put
  // chat behind a paywall.
  chat: ["free", "pro"],
};
