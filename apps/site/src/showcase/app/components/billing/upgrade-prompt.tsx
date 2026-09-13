"use client";

/**
 * What a closed `FeatureGate` renders: the feature's name, the plan
 * that unlocks it, and one way forward.
 *
 * Two densities. `full` fills the space a page section would have
 * occupied — right when the gate replaces the whole surface. `compact`
 * is for a card or a panel where something else on the page is still
 * usable.
 *
 * Naming the user's current plan is deliberate: "upgrade to Pro" is
 * advice, "you're on Free, upgrade to Pro" is an explanation.
 */

import { ArrowUpRight, Lock } from "lucide-react";
import { useTranslations } from "use-intl";

import { Link } from "@showcase/i18n/navigation";
import { Button } from "@showcase/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@showcase/components/ui/card";
import { featureGatingConfig } from "@showcase/lib/feature-gating-config";

interface UpgradePromptProps {
  /** Display name of the gated feature, already localized. */
  feature: string;
  /** Display name of the plan that unlocks it, already localized. */
  requiredPlan: string;
  description?: string;
  currentPlan?: string;
  variant?: "full" | "compact";
}

export function UpgradePrompt({
  feature,
  requiredPlan,
  description,
  currentPlan,
  variant = "full",
}: UpgradePromptProps) {
  const t = useTranslations("feature-gating");
  const compact = variant === "compact";

  return (
    <div
      className={
        compact ? "p-6" : "flex min-h-[400px] items-center justify-center p-6"
      }
    >
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div
            className={`mx-auto mb-4 flex items-center justify-center rounded-full bg-muted ${
              compact ? "h-8 w-8" : "h-12 w-12"
            }`}
          >
            <Lock className={compact ? "h-4 w-4" : "h-6 w-6"} aria-hidden />
          </div>
          <CardTitle className={compact ? "text-lg" : "text-xl"}>
            {t("prompt.title", { feature, plan: requiredPlan })}
          </CardTitle>
          <CardDescription>
            {description ??
              t("prompt.description", { feature, plan: requiredPlan })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!compact && currentPlan ? (
            <p className="mb-4 text-sm text-muted-foreground">
              {t.rich("prompt.currentPlan", {
                plan: currentPlan,
                strong: (chunks) => (
                  <span className="font-medium text-foreground">{chunks}</span>
                ),
              })}
            </p>
          ) : null}
          <Button
            size={compact ? "sm" : "default"}
            className="w-full"
            render={<Link href={featureGatingConfig.upgradeHref} />}
            nativeButton={false}
          >
            {t("prompt.cta", { plan: requiredPlan })}
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
