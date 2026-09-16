import { getFormatter, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { formatMoney, type MoneyLike } from "@/lib/format-money";

export interface PlanSummaryProps {
  planName: string;
  /** This month's spend, in micros with its currency. */
  charged?: MoneyLike | null;
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
  charged = null,
  requestsThisMonth,
  trial,
}: PlanSummaryProps) {
  const t = await getTranslations("dashboard");
  const format = await getFormatter();

  const showTrial = trial.hasTrialCredits && trial.status === "active";

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{planName}</span>
      <span>{t("plan.requests", { count: requestsThisMonth })}</span>
      {charged ? (
        <span className="font-medium text-foreground">
          {formatMoney(format, charged)}
        </span>
      ) : null}

      {showTrial ? (
        <span>
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
          {" · "}
          {t("plan.trialDays", { days: trial.daysRemaining })}
        </span>
      ) : null}

      <span className="flex items-center gap-4">
        <Link href="/usage" className="transition-colors hover:text-foreground">
          {t("plan.viewUsage")}
        </Link>
        <Link
          href="/pricing"
          className="transition-colors hover:text-foreground"
        >
          {t("plan.viewPlans")}
        </Link>
      </span>
    </div>
  );
}
