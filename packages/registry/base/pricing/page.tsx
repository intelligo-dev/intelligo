import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo-dev/auth";
import { getBillingOverview } from "@intelligo-dev/billing";

import { getPlans } from "@/lib/billing";
import { PricingContent } from "@/components/billing/pricing-content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pricing");
  return { title: t("meta.title") };
}

export default async function PricingPage() {
  const t = await getTranslations("pricing");
  const { workspace, membership } = await requireWorkspace();

  const [plans, overview] = await Promise.all([
    Promise.resolve(getPlans()),
    getBillingOverview({ workspaceId: workspace.id, role: membership.role }),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-4 md:p-10">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-bold text-foreground md:text-4xl">
          {t("page.title")}
        </h1>
        <p className="text-base text-muted-foreground">
          {t("page.description")}
        </p>
      </header>

      <PricingContent
        plans={plans}
        currentPlanSlug={overview.planSlug}
        canCheckout={membership.role === "owner"}
      />
    </div>
  );
}
