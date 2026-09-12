/**
 * Plan, credits and this month's spend — the secondary strip under the
 * dashboard's primary surface. A server component: every number is
 * already resolved by the page.
 *
 * Money is rendered with the deployment's own currency
 * (`CURRENCY` in `@/lib/billing-config`, shipped by the `pricing`
 * item), not a hardcoded symbol. Install `pricing` alongside this item,
 * or drop the charged figure and its import.
 */

import { getFormatter, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { Progress } from "@/components/ui/progress";
import { CURRENCY } from "@/lib/billing-config";

export interface PlanSummaryProps {
  planName: string;
  billingMode: "subscription" | "credit";
  chargedThisMonth: number;
  requestsThisMonth: number;
  trial: {
    hasTrialCredits: boolean;
    status: string;
    creditsRemaining: number;
    initialCredits: number;
    percentageRemaining: number;
    daysRemaining: number;
  };
}

export async function PlanSummary({
  planName,
  billingMode,
  chargedThisMonth,
  requestsThisMonth,
  trial,
}: PlanSummaryProps) {
  const t = await getTranslations("dashboard");
  const format = await getFormatter();

  const showTrial = trial.hasTrialCredits && trial.status === "active";

  return (
    <div className="mx-auto mt-12 w-full max-w-2xl space-y-3">
      <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("plan.title")}
      </p>

      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-sm font-medium">{planName}</p>
            <p className="text-xs text-muted-foreground">
              {billingMode === "subscription"
                ? t("plan.subscription")
                : t("plan.credit")}
            </p>
          </div>

          <div className="flex items-baseline gap-6 text-sm">
            <span className="text-muted-foreground">
              {t("plan.requests", { count: requestsThisMonth })}
            </span>
            <span className="font-medium">
              {format.number(chargedThisMonth, {
                style: "currency",
                currency: CURRENCY,
                maximumFractionDigits: 0,
              })}
            </span>
          </div>
        </div>

        {showTrial ? (
          <div className="mt-3 space-y-1.5 border-t pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t("plan.trialRemaining", {
                  remaining: format.number(trial.creditsRemaining, {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }),
                  initial: format.number(trial.initialCredits, {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }),
                })}
              </span>
              <span className="text-muted-foreground">
                {t("plan.trialDays", { days: trial.daysRemaining })}
              </span>
            </div>
            <Progress value={trial.percentageRemaining} />
          </div>
        ) : null}

        <div className="mt-3 flex gap-4 border-t pt-3 text-xs">
          <Link href="/usage" className="text-primary hover:underline">
            {t("plan.viewUsage")}
          </Link>
          <Link href="/pricing" className="text-primary hover:underline">
            {t("plan.viewPlans")}
          </Link>
        </div>
      </div>
    </div>
  );
}
