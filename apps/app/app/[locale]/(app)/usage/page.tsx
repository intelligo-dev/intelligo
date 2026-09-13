import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { getUsageOverview } from "@/actions/usage";
import { UsageEmptyState } from "@/components/usage/usage-empty-state";
import { UsageChart } from "@/components/usage/usage-chart";
import { UsageRecordsTable } from "@/components/usage/usage-records-table";
import { UsageSummaryCards } from "@/components/usage/usage-summary-cards";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("usage");
  return { title: t("meta.title") };
}

export default async function UsagePage() {
  const t = await getTranslations("usage");

  return (
    <div className="container mx-auto space-y-8 px-4 py-8">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{t("page.title")}</PageHeaderTitle>
          <PageHeaderDescription>{t("page.description")}</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <Suspense fallback={null}>
        <UsageOverviewSection />
      </Suspense>
    </div>
  );
}

async function UsageOverviewSection() {
  const t = await getTranslations("usage");
  const result = await getUsageOverview();

  if (!result.success) {
    return (
      <UsageEmptyState
        title={t("unavailable.title")}
        description={result.error}
      />
    );
  }

  const { data } = result;

  return (
    <div className="space-y-8">
      <UsageSummaryCards
        initialPeriodSummary={data.currentPeriod}
        plan={data.plan}
        billingMode={data.billingMode}
        quota={data.quota}
        trial={data.trial}
      />
      <UsageChart points={data.daily} />

      <UsageRecordsTable records={data.records} />
    </div>
  );
}
