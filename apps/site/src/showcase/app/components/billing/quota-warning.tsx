"use client";

/**
 * Approaching-the-limit banner for a metered action.
 *
 * Renders nothing below the warning threshold, muted between it and
 * the urgent one, destructive above. Thresholds live in
 * `@/lib/feature-gating-config`.
 *
 * The copy is this item's own, computed from `remaining`, rather than
 * the `warning` string `@intelligo-dev/billing` returns: that string is
 * produced by a package that cannot know the caller's locale. Pass
 * `message` to override.
 */

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "use-intl";

import type { FeatureQuotaResult } from "@intelligo-dev/billing";
import { cn } from "@showcase/lib/utils";
import { featureGatingConfig } from "@showcase/lib/feature-gating-config";

interface QuotaWarningProps {
  quota: FeatureQuotaResult;
  /** Overrides the computed sentence. */
  message?: string;
  className?: string;
}

export function QuotaWarning({ quota, message, className }: QuotaWarningProps) {
  const t = useTranslations("feature-gating");
  const { warnAtPercent, urgentAtPercent } = featureGatingConfig;

  if (quota.percentage < warnAtPercent) return null;

  const isUrgent = quota.percentage >= urgentAtPercent;

  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        isUrgent
          ? "border-destructive/20 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-foreground",
        className
      )}
    >
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      <span>
        {message ??
          (quota.remaining > 0
            ? t("quota.remaining", { count: quota.remaining })
            : t("quota.exhausted"))}
      </span>
    </div>
  );
}
