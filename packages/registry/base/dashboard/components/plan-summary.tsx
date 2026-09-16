/**
 * The right half of the page's foot: plan, this month's spend, and a
 * trial's remaining credits when one is running.
 *
 * One line of facts rather than a bordered card under a section
 * heading. Nothing here is an action a person came to the home page to
 * take, and at card weight it argued with the composer for attention;
 * as a line it stays readable and stops pretending to be the point.
 *
 * A server component: every number is already resolved by the page.
 *
 * Money arrives as an amount that names its own currency and is
 * rendered through `formatMoney` (`@/lib/format-money`, shipped by the
 * `pricing` item), not against a symbol this file chooses. Install
 * `pricing` alongside this item, or drop the charged figure and its
 * import.
 */

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
