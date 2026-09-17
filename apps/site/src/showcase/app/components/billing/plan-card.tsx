"use client";

/**
 * One plan's pricing card: name, price, feature list, and a checkout
 * CTA whose state depends on whether it's the workspace's current
 * plan, the free plan, or something the caller can afford to buy.
 *
 * The plan catalogue is an arbitrary, product-registered map
 * (see `@/lib/billing`'s `getPlans`), so this card does not assume an
 * upgrade/downgrade ordering the way a fixed 3-tier catalogue could.
 * Every non-current, non-free plan gets the same "switch to this
 * plan" checkout button; a deployment with a strict tier order can add
 * that distinction back in its own copy of this file.
 *
 * `plan.name`, `plan.description`, and `plan.features` come from the
 * product-registered plan catalogue, not from this item's copy — they
 * are deployment DATA and
 * are rendered verbatim rather than routed through `messages/en.json`.
 * Only this card's own chrome (badges, buttons) is translated.
 * Marked `"use client"` because it is always rendered from
 * `pricing-content.tsx`'s client tree.
 */

import { Check } from "lucide-react";
import { useFormatter, useTranslations } from "use-intl";

import { Badge } from "@showcase/components/ui/badge";
import { Button } from "@showcase/components/ui/button";
import { Card } from "@showcase/components/ui/card";

import { CheckoutButton } from "./checkout-button";
import { CURRENCY } from "@showcase/lib/billing-config";
import type { PlanConfig } from "@intelligo-dev/billing/plans";

interface PlanCardProps {
  plan: PlanConfig;
  currentPlanSlug: string;
  interval: "monthly" | "yearly";
  /** Whether the signed-in caller is allowed to start checkout (owner-only). */
  canCheckout: boolean;
  isRecommended?: boolean;
}

export function PlanCard({
  plan,
  currentPlanSlug,
  interval,
  canCheckout,
  isRecommended = false,
}: PlanCardProps) {
  const t = useTranslations("pricing");
  const format = useFormatter();
  const isCurrent = plan.slug === currentPlanSlug;

  // A plan with interval prices is quoted per period; one without is a
  // single purchase, and the toggle above is hidden for it entirely
  // (see pricing-content.tsx) so the label can't contradict the price.
  const intervalPrice =
    interval === "monthly" ? plan.priceMonthly : plan.priceYearly;
  const price = intervalPrice ?? plan.priceOneTime;
  const isFree = price === 0;
  const periodLabel =
    intervalPrice === undefined
      ? t("planCard.oneTime")
      : interval === "monthly"
        ? t("planCard.perMonth")
        : t("planCard.perYear");

  // Money is never rendered by a package helper: currency is a
  // deployment decision (`CURRENCY` in lib/billing-config.ts), and
  // "free" is copy, not a formatted zero.
  const priceLabel = isFree
    ? t("planCard.free")
    : format.number(price, {
        style: "currency",
        currency: CURRENCY,
        maximumFractionDigits: 0,
      });

  return (
    <Card
      className={`relative flex h-full flex-col p-6 ${
        isRecommended
          ? "border-2 border-foreground/30 shadow-lg dark:border-foreground/40"
          : ""
      }`}
    >
      {isRecommended && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-foreground text-background">
          {t("planCard.recommended")}
        </Badge>
      )}

      <div className="flex flex-1 flex-col space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
            {isCurrent && (
              <Badge className="border border-border bg-accent text-muted-foreground">
                {t("planCard.current")}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{plan.description}</p>
        </div>

        <div className="space-y-1">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold text-foreground">
              {priceLabel}
            </span>
            {!isFree && (
              <span className="text-sm text-muted-foreground">
                {periodLabel}
              </span>
            )}
          </div>
        </div>

        <ul className="space-y-3">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 flex-shrink-0 text-muted-foreground" />
              <span className="text-sm text-foreground">{feature}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-2">
          {isCurrent ? (
            // Outline, not the default fill: the plan you are already
            // on is a statement of fact, and a solid disabled button
            // reads as the page's primary action greyed out.
            <Button disabled variant="outline" className="w-full">
              {t("planCard.currentPlanButton")}
            </Button>
          ) : isFree ? (
            <div className="py-2 text-center">
              <p className="text-sm text-muted-foreground">
                {t("planCard.freeForever")}
              </p>
            </div>
          ) : !canCheckout ? (
            <Button variant="outline" disabled className="w-full">
              {t("planCard.askOwner")}
            </Button>
          ) : (
            <CheckoutButton
              planSlug={plan.slug}
              interval={interval}
              className="w-full"
            >
              {t("planCard.switchTo", { planName: plan.name })}
            </CheckoutButton>
          )}
        </div>
      </div>
    </Card>
  );
}
