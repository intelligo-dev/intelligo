/**
 * The reference product's plan catalogue and feature matrix.
 *
 * Lives in the application because plan data is the product's, not the
 * framework's (ADR-0006). The shape is all that @intelligo-dev/billing
 * knows; the names, prices, and limits are entirely ours — and
 * deliberately shared with no real product, which is the point of
 * this app existing.
 *
 * Prices are in the currency `lib/billing-config.ts` declares (USD
 * here). Pro carries monthly and yearly prices so the pricing page's
 * interval toggle has something real to switch between — a plan with
 * only `priceOneTime` hides the toggle entirely.
 */

import { fromMajor } from "@intelligo-dev/core/money";
import type { PlanConfig } from "@intelligo-dev/billing/plans";

export const REFERENCE_PLANS: Record<string, PlanConfig> = {
  free: {
    name: "Free",
    slug: "free",
    description: "Try the assistant",
    priceOneTime: 0,
    targetAudience: "Everyone",
    aiModelLabel: "Base",
    // Half a dollar a month of model time: roughly a hundred turns on
    // Flash at the shipped margin, which is what "try the assistant"
    // costs.
    monthlyAllowance: fromMajor(0.5, "USD"),
    limits: {
      rolloverEnabled: false,
      chatMessages: 30,
    },
    features: ["30 messages a month"],
  },
  pro: {
    name: "Pro",
    slug: "pro",
    description: "For daily use",
    priceOneTime: 20,
    priceMonthly: 20,
    priceYearly: 192,
    targetAudience: "Teams",
    aiModelLabel: "Advanced",
    /** $15 of model time inside a $20 plan. */
    monthlyAllowance: fromMajor(15, "USD"),
    limits: {
      rolloverEnabled: true,
      chatMessages: 1_000,
    },
    features: [
      "1,000 messages a month",
      "File uploads",
      "Two months free on yearly",
    ],
  },
};

export const REFERENCE_FEATURES: Record<string, readonly string[]> = {
  assistant: ["free", "pro"],
  file_uploads: ["pro"],
  // Gates POST /api/chat (the `chat` registry item) — every plan here
  // so a clean install can chat with no configuration; tighten to
  // ["pro"] if this deployment wants chat behind a paywall.
  chat: ["free", "pro"],
};
