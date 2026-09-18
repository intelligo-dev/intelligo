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
import { AnimatedList, AnimatedListItem } from "@showcase/components/ui/animated-list";
import type { PlanConfig } from "@intelligo-dev/billing/plans";

import { IntervalToggle } from "./interval-toggle";
import { PlanCard } from "./plan-card";

interface PricingContentProps {
  /** The plan catalogue, resolved by the page through `getPlans`. */
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
        <div className="flex justify-center">
          <IntervalToggle interval={interval} onChange={setInterval} />
        </div>
      ) : null}

      {/* Centred wrap rather than a grid: the catalogue can hold any
          number of plans, and fixed-width cards stay the same size
          whether there are two or five. */}
      <AnimatedList as="div" className="flex flex-wrap justify-center gap-6">
        {planEntries.map((plan) => (
          <AnimatedListItem as="div" key={plan.slug} className="w-full sm:w-80">
            <PlanCard
              plan={plan}
              currentPlanSlug={currentPlanSlug}
              interval={interval}
              canCheckout={canCheckout}
              // No plan is highlighted by default; set `isRecommended`
              // for the one you want to single out.
            />
          </AnimatedListItem>
        ))}
      </AnimatedList>
    </div>
  );
}
