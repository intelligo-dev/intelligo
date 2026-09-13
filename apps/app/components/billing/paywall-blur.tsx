"use client";

/**
 * Preview paywall: shows that the content exists and is worth having,
 * without giving it away. The children render blurred, inert and
 * unselectable behind an overlay with the upgrade CTA.
 *
 * Use it where the value is visible at a glance — a generated report,
 * an analysis, a long answer — and a plain "upgrade to see this" would
 * be asking the user to buy something they cannot picture. Where the
 * content is not self-evidently valuable, `UpgradePrompt` is honest
 * and this is a tease.
 *
 * The blur is presentation, not protection: the content is in the DOM.
 * Anything that must not reach an unentitled browser belongs behind
 * `FeatureGate` on the server instead.
 */

import { ArrowRight, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { featureGatingConfig } from "@/lib/feature-gating-config";

interface PaywallBlurProps {
  children: React.ReactNode;
  isLocked: boolean;
  /** Heading over the blur; falls back to this item's copy. */
  title?: string;
  /** Sentence under the heading. */
  description?: string;
  /** CTA label; falls back to this item's copy. */
  ctaLabel?: string;
}

export function PaywallBlur({
  children,
  isLocked,
  title,
  description,
  ctaLabel,
}: PaywallBlurProps) {
  const t = useTranslations("feature-gating");

  if (!isLocked) return <>{children}</>;

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none select-none blur-sm">
        {children}
      </div>

      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-[2px]">
        <div className="max-w-sm p-6 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="size-5 text-primary" aria-hidden />
          </div>
          <h3 className="text-lg font-semibold">
            {title ?? t("paywall.title")}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {description ?? t("paywall.description")}
          </p>
          <Button
            size="lg"
            className="mt-4"
            render={<Link href={featureGatingConfig.upgradeHref} />}
            nativeButton={false}
          >
            {ctaLabel ?? t("paywall.cta")}
            <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
