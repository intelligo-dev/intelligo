import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo/auth";
import { getBillingOverview } from "@intelligo/billing";

import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { CreditBundles } from "@/components/billing/credit-bundles";
import { PortalButton } from "@/components/billing/portal-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing-settings");
  return { title: t("meta.title") };
}

/**
 * Billing settings page — server component.
 *
 * Reads the caller's role from `requireWorkspace()` and the
 * role-shaped billing state from `getBillingOverview` (`@intelligo/billing`
 * — moved server-side out of what used to be a client component's own
 * three-way branch). `member` and `admin` get a read-only summary;
 * `owner` gets the full plan/credit/payment-method view.
 *
 * `overview.subscription.status` is left untranslated and rendered
 * verbatim: `@intelligo/billing` types it as a plain `string` mirrored
 * from Stripe's own (larger-than-documented) subscription status
 * vocabulary, not a closed enum, so keying a translation off it risks
 * a missing-message error for any status this deployment hasn't
 * localized. Revisit this once the package narrows that type to a
 * closed union.
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
      <header>
        <h1 className="text-lg font-semibold">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("page.description", { workspaceName: workspace.name })}
        </p>
      </header>

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

          <Card className="space-y-2 p-6">
            <p className="text-sm font-medium text-muted-foreground">
              {t("owner.creditBalanceLabel")}
            </p>
            <p className="text-2xl font-semibold">
              {format.number(overview.creditBalance)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {t("owner.creditsUnit")}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {t("owner.creditBalanceNote")}
            </p>
          </Card>

          <CreditBundles currentCredits={overview.creditBalance} />

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
