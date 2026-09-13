"use client";

/**
 * The quietest of the three gating densities: one row, for a control
 * that is present but unavailable — a disabled toggle, a menu item a
 * plan doesn't include. Use `UpgradePrompt` when the gate replaces
 * real content, and this when it only annotates it.
 */

import { ArrowUpRight, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { featureGatingConfig } from "@/lib/feature-gating-config";

interface InlineUpgradeBannerProps {
  /** Display name of the gated feature, already localized. */
  feature: string;
  /** Display name of the plan that unlocks it, already localized. */
  requiredPlan: string;
  /** Overrides the default sentence entirely. */
  message?: string;
}

export function InlineUpgradeBanner({
  feature,
  requiredPlan,
  message,
}: InlineUpgradeBannerProps) {
  const t = useTranslations("feature-gating");

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Lock className="size-4 text-muted-foreground" aria-hidden />
      </span>
      <p className="flex-1 text-sm text-muted-foreground">
        {message ?? t("inline.message", { feature, plan: requiredPlan })}
      </p>
      <Button
        size="sm"
        variant="outline"
        render={<Link href={featureGatingConfig.upgradeHref} />}
        nativeButton={false}
      >
        {t("inline.cta")}
        <ArrowUpRight className="ml-2 size-3" />
      </Button>
    </div>
  );
}
