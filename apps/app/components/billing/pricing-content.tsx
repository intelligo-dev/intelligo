"use client";

/**
 * Client wrapper around the plan grid: owns the monthly/yearly
 * interval selection and the "checkout was canceled" banner, both of
 * which need client state/searchParams the server-rendered page
 * doesn't have.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
        <div className="flex justify-center">
          <IntervalToggle interval={interval} onChange={setInterval} />
        </div>
      ) : null}

      {/* Centred wrap rather than a three-column grid: the catalogue is
          a product-registered map of any size (ADR-0006), and a fixed
          three columns left two plans hanging against the left edge
          with a hole where the third would be. Each card takes a fixed
          width so two, three or five of them stay the same size. */}
      <div className="flex flex-wrap justify-center gap-6">
        {planEntries.map((plan) => (
          <div key={plan.slug} className="w-full sm:w-80">
            <PlanCard
              plan={plan}
              currentPlanSlug={currentPlanSlug}
              interval={interval}
              canCheckout={canCheckout}
              // No plan is singled out as "recommended" here: guessing a
              // tier name or position would reintroduce the
              // vertical-specific assumption this item avoids. A
              // deployment that wants a highlighted plan sets
              // `isRecommended` in its own copy of this file.
            />
          </div>
        ))}
      </div>
    </div>
  );
}
