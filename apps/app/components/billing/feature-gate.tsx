import { getTranslations } from "next-intl/server";

import { getWorkspacePlan, hasFeature } from "@intelligo-dev/billing";
import {
  getDefaultProductSlug,
  getPlanBySlug,
} from "@intelligo-dev/billing/plans";

import { featureCatalog } from "@/lib/feature-catalog";
import { UpgradePrompt } from "./upgrade-prompt";

interface FeatureGateProps {
  workspaceId: string;
  /** Feature key, as registered with `registerProductFeatures`. */
  feature: string;
  children: React.ReactNode;
  /** Rendered instead of the default prompt when the gate closes. */
  fallback?: React.ReactNode;
  variant?: "full" | "compact";
}

export async function FeatureGate({
  workspaceId,
  feature,
  children,
  fallback,
  variant = "full",
}: FeatureGateProps) {
  if (await hasFeature(workspaceId, feature)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  const t = await getTranslations("feature-gating");
  // Namespace-less: catalogue keys are fully qualified so a product can
  // point them at its own namespace.
  const tAny = await getTranslations();

  const descriptor = featureCatalog[feature];
  const currentPlanSlug = await getWorkspacePlan(workspaceId);

  // The plan catalogue is registered per product by the composition
  // root; `getDefaultProductSlug()` is the slug it set there.
  const product = getDefaultProductSlug();
  const planName = (slug: string) => getPlanBySlug(slug, product)?.name ?? slug;

  return (
    <UpgradePrompt
      feature={descriptor ? tAny(descriptor.labelKey) : t("genericFeature")}
      requiredPlan={planName(descriptor?.requiredPlan ?? "pro")}
      description={
        descriptor?.descriptionKey ? tAny(descriptor.descriptionKey) : undefined
      }
      currentPlan={planName(currentPlanSlug)}
      variant={variant}
    />
  );
}
