"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { formatMoney } from "@/lib/format-money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  StatCard,
  StatCardAction,
  StatCardHeader,
  StatCardLabel,
  StatCardValue,
} from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { AnimatedList, AnimatedListItem } from "@/components/ui/animated-list";

import {
  getUsagePeriodSummary,
  type UsagePeriod,
  type UsagePeriodSummary,
  type UsagePlan,
  type UsageQuotaState,
  type UsageTrialState,
} from "@/actions/usage";

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
        status: "destructive" as const,
      }
    : quota.warningThreshold
      ? {
          label: t("summaryCards.quotaBadge.nearingLimit"),
          status: "warning" as const,
        }
      : {
          label: t("summaryCards.quotaBadge.withinLimit"),
          status: "neutral" as const,
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

      <AnimatedList
        as="div"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <AnimatedListItem as="div" className="grid">
          <StatCard aria-busy={isPending}>
            <StatCardHeader>
              <StatCardLabel>{t("summaryCards.tokensUsed")}</StatCardLabel>
              <StatCardValue>{format.number(summary.tokensUsed)}</StatCardValue>
            </StatCardHeader>
          </StatCard>
        </AnimatedListItem>

        <AnimatedListItem as="div" className="grid">
          <StatCard aria-busy={isPending}>
            <StatCardHeader>
              <StatCardLabel>{t("summaryCards.chargedAmount")}</StatCardLabel>
              <StatCardValue>
                {/* The amount names its own currency, and shows enough
                    decimals to be worth reading: a month of cheap turns
                    is a few cents, not "$0". */}
                {summary.charged ? formatMoney(format, summary.charged) : "—"}
              </StatCardValue>
            </StatCardHeader>
          </StatCard>
        </AnimatedListItem>

        <AnimatedListItem as="div" className="grid">
          <StatCard aria-busy={isPending}>
            <StatCardHeader>
              <StatCardLabel>{t("summaryCards.requests")}</StatCardLabel>
              <StatCardValue>
                {format.number(summary.requestCount)}
              </StatCardValue>
            </StatCardHeader>
          </StatCard>
        </AnimatedListItem>

        <AnimatedListItem as="div" className="grid">
          <StatCard>
            <StatCardHeader>
              <StatCardLabel>{t("summaryCards.planQuota")}</StatCardLabel>
              <StatCardAction>
                <StatusBadge status={quotaBadge.status}>
                  {quotaBadge.label}
                </StatusBadge>
              </StatCardAction>
            </StatCardHeader>
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
          </StatCard>
        </AnimatedListItem>
      </AnimatedList>

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
