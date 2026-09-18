import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo-dev/auth";
import { getBillingOverview } from "@intelligo-dev/billing";

import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { CreditBundles } from "@/components/billing/credit-bundles";
import { formatMoney } from "@/lib/format-money";
import { PortalButton } from "@/components/billing/portal-button";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";
import {
  StatCard,
  StatCardFooter,
  StatCardHeader,
  StatCardLabel,
  StatCardValue,
} from "@/components/ui/stat-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing-settings");
  return { title: t("meta.title") };
}

/**
 * Reads the caller's role from `requireWorkspace()` and the role-shaped
 * billing state from `getBillingOverview` (`@intelligo-dev/billing`).
 * `member` and `admin` get a read-only summary; `owner` gets the full
 * plan/credit/payment-method view.
 *
 * `overview.subscription.status` renders verbatim, untranslated: it is a
 * plain `string` mirrored from Stripe's open-ended status vocabulary, so
 * keying a translation off it risks a missing-message error.
 */
export default async function BillingSettingsPage() {
  const t = await getTranslations("billing-settings");
  const format = await getFormatter();
  const { workspace, membership } = await requireWorkspace();
  const overview = await getBillingOverview({
    workspaceId: workspace.id,
    role: membership.role,
  });

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle level={2}>{t("page.title")}</PageHeaderTitle>
          <PageHeaderDescription>
            {t("page.description", { workspaceName: workspace.name })}
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      {overview.role === "member" && (
        <Card className="space-y-2 p-6">
          <p className="text-sm font-medium">
            {t("member.currentPlan", { planName: overview.planName })}
          </p>
          <p className="text-sm text-muted-foreground">{t("member.note")}</p>
        </Card>
      )}

      {overview.role === "admin" && (
        <Card className="space-y-2 p-6">
          <p className="text-sm font-medium">
            {t("admin.currentPlan", { planName: overview.planName })}
          </p>
          <p className="text-sm text-muted-foreground">{t("admin.note")}</p>
        </Card>
      )}

      {overview.role === "owner" && (
        <div className="space-y-6">
          <Card className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("owner.currentPlanLabel")}
                </p>
                <p className="text-2xl font-semibold">{overview.planName}</p>
              </div>
              {overview.subscription && (
                <span className="text-sm capitalize text-muted-foreground">
                  {overview.subscription.status}
                </span>
              )}
            </div>

            {overview.subscription?.currentPeriodEnd && (
              <p className="text-xs text-muted-foreground">
                {t("owner.renews", {
                  date: format.dateTime(
                    overview.subscription.currentPeriodEnd,
                    {
                      dateStyle: "medium",
                    }
                  ),
                })}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/pricing"
                className="text-sm font-medium underline underline-offset-4"
              >
                {t("owner.viewAllPlans")}
              </Link>
              {overview.subscription?.stripeCustomerId && (
                <PortalButton>{t("owner.manageSubscription")}</PortalButton>
              )}
            </div>
          </Card>

          <StatCard>
            <StatCardHeader>
              <StatCardLabel>{t("owner.creditBalanceLabel")}</StatCardLabel>
              <StatCardValue>
                {overview.creditBalance
                  ? formatMoney(format, overview.creditBalance)
                  : "—"}
              </StatCardValue>
            </StatCardHeader>
            <StatCardFooter>{t("owner.creditBalanceNote")}</StatCardFooter>
          </StatCard>

          <CreditBundles currentBalance={overview.creditBalance} />

          {overview.subscription?.stripeCustomerId && (
            <Card className="space-y-2 p-6">
              <p className="text-sm font-medium">
                {t("owner.paymentMethodTitle")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("owner.paymentMethodNote")}
              </p>
              <PortalButton variant="outline">
                {t("owner.openPortal")}
              </PortalButton>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
