"use client";

/**
 * The modal that appears when a metered action is refused mid-flow —
 * the moment a user tries to do the thing and can't.
 *
 * Distinct from `QuotaWarning`, which is ambient and appears *before*
 * the limit: this one interrupts, so it has to say what ran out, what
 * upgrading changes, and offer a way out that isn't upgrading. The
 * dismiss control is deliberate; a paywall with no exit is a trap.
 *
 * Plans come from the catalogue your composition root registered, so
 * the offer stays correct when pricing changes — no plan names or
 * prices are written into this component.
 */

import { ArrowRight, Sparkles } from "lucide-react";
import { useFormatter, useTranslations } from "use-intl";

import type { FeatureQuotaResult } from "@intelligo-dev/billing";
import type { PlanConfig } from "@intelligo-dev/billing/plans";

import { Link } from "@showcase/i18n/navigation";
import { Button } from "@showcase/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@showcase/components/ui/dialog";
import { CURRENCY } from "@showcase/lib/billing-config";
import { featureGatingConfig } from "@showcase/lib/feature-gating-config";

interface QuotaLimitDialogProps {
  open: boolean;
  onClose: () => void;
  quota: FeatureQuotaResult;
  /**
   * Plans to offer, already filtered to ones above the caller's
   * current plan. Resolve them on the server (`getPlanConfigs`) and
   * pass them down — this component does not decide who is eligible
   * for what.
   */
  upgradeOptions: PlanConfig[];
  /** Localized name of the action that ran out (e.g. "Messages"). */
  actionLabel?: string;
}

export function QuotaLimitDialog({
  open,
  onClose,
  quota,
  upgradeOptions,
  actionLabel,
}: QuotaLimitDialogProps) {
  const t = useTranslations("feature-gating");
  const format = useFormatter();

  const price = (plan: PlanConfig) => {
    const amount = plan.priceMonthly ?? plan.priceOneTime;
    if (!amount) return null;
    return format.number(amount, {
      style: "currency",
      currency: CURRENCY,
      maximumFractionDigits: 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="size-6 text-primary" aria-hidden />
          </div>
          <DialogTitle className="text-center">
            {t("limitDialog.title", {
              action: actionLabel ?? t("limitDialog.genericAction"),
            })}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t("limitDialog.description", {
              used: quota.used,
              limit: quota.limit,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          {upgradeOptions.map((plan, index) => {
            const amount = price(plan);
            return (
              <Button
                key={plan.slug}
                size="lg"
                variant={index === 0 ? "default" : "outline"}
                className="w-full"
                render={<Link href={featureGatingConfig.upgradeHref} />}
                nativeButton={false}
              >
                {amount
                  ? t("limitDialog.planCta", {
                      plan: plan.name,
                      price: amount,
                    })
                  : t("limitDialog.planCtaNoPrice", { plan: plan.name })}
                <ArrowRight className="ml-2 size-4" />
              </Button>
            );
          })}

          <Button variant="ghost" className="w-full" onClick={onClose}>
            {t("limitDialog.dismiss")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
