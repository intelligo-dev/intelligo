/**
 * Server-side entitlement gate: renders `children` when the active
 * workspace is entitled to `feature`, and an upgrade prompt when it
 * isn't.
 *
 * A server component so gated content never reaches a browser that is
 * not entitled to it. It is still not authorization: the action or
 * route behind the feature must check for itself.
 *
 * What a locked feature is called, and which plan unlocks it, comes
 * from `@/lib/feature-catalog` — consumer-owned, because features are
 * product data. An unlisted feature still gates; it just falls back to
 * generic copy.
 */

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
      requiredPlan={
        descriptor?.requiredPlan
          ? planName(descriptor.requiredPlan)
          : t("genericPlan")
      }
      description={
        descriptor?.descriptionKey ? tAny(descriptor.descriptionKey) : undefined
      }
      currentPlan={planName(currentPlanSlug)}
      variant={variant}
    />
  );
}
