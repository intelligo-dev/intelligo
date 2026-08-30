"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "use-intl";

import { Badge } from "@showcase/components/ui/badge";
import { CURRENCY } from "@showcase/lib/billing-config";
import { Card, CardContent, CardHeader, CardTitle } from "@showcase/components/ui/card";
import { Progress } from "@showcase/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@showcase/components/ui/tabs";

import {
  getUsagePeriodSummary,
  type UsagePeriod,
  type UsagePeriodSummary,
  type UsagePlan,
  type UsageQuotaState,
  type UsageTrialState,
} from "@showcase/actions/usage";

const PERIODS: UsagePeriod[] = ["7d", "30d", "current"];

export function UsageSummaryCards({
  initialPeriodSummary,
  plan,
  billingMode,
  quota,
  trial,
}: {
  initialPeriodSummary: UsagePeriodSummary;
  plan: UsagePlan;
  billingMode: "subscription" | "credit";
  quota: UsageQuotaState;
  trial: UsageTrialState;
}) {
  const t = useTranslations("usage");
  const format = useFormatter();
  const [period, setPeriod] = useState<UsagePeriod>("current");
  const [summary, setSummary] = useState(initialPeriodSummary);
  const [isPending, startTransition] = useTransition();

  function handlePeriodChange(next: string) {
    const nextPeriod = next as UsagePeriod;
    setPeriod(nextPeriod);

    startTransition(async () => {
      const result = await getUsagePeriodSummary(nextPeriod);
      if (result.success) {
        setSummary(result.data);
      }
    });
  }

  const quotaBadge = quota.criticalThreshold
    ? {
        label: t("summaryCards.quotaBadge.limitReached"),
        variant: "destructive" as const,
      }
    : quota.warningThreshold
      ? {
          label: t("summaryCards.quotaBadge.nearingLimit"),
          variant: "secondary" as const,
        }
      : {
          label: t("summaryCards.quotaBadge.withinLimit"),
          variant: "outline" as const,
        };

  return (
    <div className="space-y-4">
      <Tabs value={period} onValueChange={handlePeriodChange}>
        <TabsList>
          {PERIODS.map((value) => (
            <TabsTrigger key={value} value={value} disabled={isPending}>
              {t(`summaryCards.periods.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card aria-busy={isPending}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("summaryCards.tokensUsed")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {format.number(summary.tokensUsed)}
            </p>
          </CardContent>
        </Card>

        <Card aria-busy={isPending}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("summaryCards.chargedAmount")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {format.number(summary.chargedAmount, {
                style: "currency",
                currency: CURRENCY,
                maximumFractionDigits: 0,
              })}
            </p>
          </CardContent>
        </Card>

        <Card aria-busy={isPending}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("summaryCards.requests")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {format.number(summary.requestCount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("summaryCards.planQuota")}
              </CardTitle>
              <Badge variant={quotaBadge.variant}>{quotaBadge.label}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={Math.min(quota.percentage, 100)} />
            <p className="text-xs text-muted-foreground">
              {billingMode === "credit"
                ? t("summaryCards.quotaAllowanceCredit", {
                    percentage: quota.percentage,
                    planName: plan.name,
                  })
                : t("summaryCards.quotaAllowance", {
                    percentage: quota.percentage,
                    planName: plan.name,
                  })}
            </p>
          </CardContent>
        </Card>
      </div>

      {trial.hasTrialCredits && trial.status === "active" ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("summaryCards.trialCredits")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between text-sm">
              <span>
                {t("summaryCards.trialRemaining", {
                  count: format.number(trial.creditsRemaining),
                })}
              </span>
              <span className="text-muted-foreground">
                {t("summaryCards.trialOf", {
                  count: format.number(trial.initialCredits),
                })}
              </span>
            </div>
            <Progress value={Math.min(trial.percentageRemaining, 100)} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
