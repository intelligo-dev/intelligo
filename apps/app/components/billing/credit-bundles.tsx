"use client";

/**
 * This deployment's credit bundles (`CREDIT_BUNDLES` from `@/lib/billing`,
 * installed by the `pricing` item) for one-time purchase.
 *
 * `bundle.name` is deployment config (`lib/billing-config.ts`), not this
 * item's copy, so it renders verbatim; localize it in that file.
 *
 * Each of a bundle's two amounts is formatted in its own currency:
 * `price` is what the buyer pays the payment provider, `grant` is what
 * lands in the ledger. A pack can cost $5 and grant ₮100,000.
 *
 * A bundle in the legacy `{ credits, priceUsd }` shape is read as whole
 * units of `CURRENCY`, priced in dollars.
 */

import { useState } from "react";
import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AnimatedList, AnimatedListItem } from "@/components/ui/animated-list";

import { createCreditPurchaseSession } from "@/actions/billing";
import { CREDIT_BUNDLES, CURRENCY } from "@/lib/billing-config";

/** Micros are millionths of one major unit. */
const MICROS_PER_UNIT = 1_000_000;

type Bundle = (typeof CREDIT_BUNDLES)[number];
type Amount = { amount: number; currency: string };

/** What the workspace receives, in the ledger's own currency. */
function grantOf(bundle: Bundle): Amount {
  return "grant" in bundle
    ? bundle.grant
    : { amount: bundle.credits * MICROS_PER_UNIT, currency: CURRENCY };
}

/** What the buyer pays, in the currency the provider charges. */
function priceOf(bundle: Bundle): Amount {
  return "price" in bundle
    ? bundle.price
    : {
        amount: Math.round(bundle.priceUsd * MICROS_PER_UNIT),
        currency: "USD",
      };
}

interface CreditBundlesProps {
  /** The top-up balance, in the ledger's own currency. */
  currentBalance?: Amount | null;
}

export function CreditBundles({ currentBalance }: CreditBundlesProps) {
  const t = useTranslations("billing-settings");
  const format = useFormatter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePurchase = async (bundleId: string) => {
    setError(null);
    setLoadingId(bundleId);

    const result = await createCreditPurchaseSession({ bundleId });

    if (!result.success) {
      setError(result.error);
      setLoadingId(null);
      return;
    }

    window.location.href = result.data.url;
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">{t("creditBundles.buyMore")}</p>
        {currentBalance && (
          <p className="text-sm text-muted-foreground">
            {t("creditBundles.currentBalance", {
              balance: format.number(currentBalance.amount / MICROS_PER_UNIT, {
                style: "currency",
                currency: currentBalance.currency,
              }),
            })}
          </p>
        )}
      </div>

      <AnimatedList as="div" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {CREDIT_BUNDLES.map((bundle) => {
          const isLoading = loadingId === bundle.id;
          const grant = grantOf(bundle);
          const price = priceOf(bundle);
          return (
            <AnimatedListItem as="div" key={bundle.id}>
              <Card className="h-full space-y-4 p-6">
                <div className="flex items-center gap-2">
                  <Coins className="size-5 text-muted-foreground" />
                  <p className="font-medium">{bundle.name}</p>
                </div>
                <p className="text-2xl font-semibold text-foreground">
                  {format.number(grant.amount / MICROS_PER_UNIT, {
                    style: "currency",
                    currency: grant.currency,
                  })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("creditBundles.oneTime", {
                    price: format.number(price.amount / MICROS_PER_UNIT, {
                      style: "currency",
                      currency: price.currency,
                    }),
                  })}
                </p>
                <Button
                  onClick={() => handlePurchase(bundle.id)}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full"
                >
                  {isLoading
                    ? t("creditBundles.redirecting")
                    : t("creditBundles.purchase")}
                </Button>
              </Card>
            </AnimatedListItem>
          );
        })}
      </AnimatedList>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
