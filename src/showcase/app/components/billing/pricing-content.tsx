"use client";

/**
 * Client wrapper around the plan grid: owns the monthly/yearly
 * interval selection and the "checkout was canceled" banner, both of
 * which need client state/searchParams the server-rendered page
 * doesn't have.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "@showcase/shims/next-navigation";
import { useTranslations } from "use-intl";

import { Alert, AlertDescription } from "@showcase/components/ui/alert";
import type { PlanConfig } from "@intelligo-dev/billing/plans";

import { IntervalToggle } from "./interval-toggle";
import { PlanCard } from "./plan-card";

interface PricingContentProps {
  /**
   * The registered plan catalogue, resolved server-side by the page
   * (through `@/lib/billing`'s `getPlans`) and handed down as data —
   * this client component never reads the plan registry itself.
   */
  plans: Partial<Record<string, PlanConfig>>;
  currentPlanSlug: string;
  canCheckout: boolean;
}

export function PricingContent({
  plans,
  currentPlanSlug,
  canCheckout,
}: PricingContentProps) {
  const t = useTranslations("pricing");
  const searchParams = useSearchParams();
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const hasIntervalPricing = Object.values(plans).some(
    (plan) =>
      plan !== undefined &&
      (plan.priceMonthly !== undefined || plan.priceYearly !== undefined)
  );
  const [showCanceled, setShowCanceled] = useState(false);

  useEffect(() => {
    if (searchParams.get("canceled") !== "true") return;
    setShowCanceled(true);
    const timeout = setTimeout(() => setShowCanceled(false), 5000);
    return () => clearTimeout(timeout);
  }, [searchParams]);

  const planEntries = Object.values(plans).filter((plan): plan is PlanConfig =>
    Boolean(plan)
  );

  return (
    <div className="space-y-8">
      {showCanceled && (
        <Alert>
          <AlertDescription>{t("content.canceled")}</AlertDescription>
        </Alert>
      )}

      {/* Hidden unless at least one plan is actually priced per period
          — a toggle that changes nothing is worse than no toggle. */}
      {hasIntervalPricing ? (
        <IntervalToggle interval={interval} onChange={setInterval} />
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {planEntries.map((plan) => (
          <PlanCard
            key={plan.slug}
            plan={plan}
            currentPlanSlug={currentPlanSlug}
            interval={interval}
            canCheckout={canCheckout}
            // No plan is singled out as "recommended" here: the
            // catalogue is an arbitrary, product-registered map
            // (ADR-0006), and guessing a tier name or position would
            // reintroduce the vertical-specific assumption this item
            // is meant to avoid. A deployment that wants a highlighted
            // plan sets `isRecommended` in its own copy of this file.
          />
        ))}
      </div>
    </div>
  );
}
