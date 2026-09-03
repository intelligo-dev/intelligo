"use client";

/**
 * Displays this deployment's credit bundles (`@/lib/billing`'s
 * `CREDIT_BUNDLES`, installed by the `pricing` item) for one-time
 * purchase.
 *
 * `bundle.name` is deployment config from `CREDIT_BUNDLES`
 * (`lib/billing-config.ts`), not copy owned by this item — it is
 * rendered verbatim rather than routed through `messages/en.json`
 * (ADR-0010); localize it in that config file if this deployment
 * needs bundle names in more than one language.
 */

import { useState } from "react";
import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CURRENCY } from "@/lib/billing-config";
import { Card } from "@/components/ui/card";

import { createCreditPurchaseSession } from "@/actions/billing";
import { CREDIT_BUNDLES } from "@/lib/billing-config";

interface CreditBundlesProps {
  currentCredits?: number;
}

export function CreditBundles({ currentCredits }: CreditBundlesProps) {
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
        {currentCredits !== undefined && (
          <p className="text-sm text-muted-foreground">
            {t("creditBundles.currentBalance", {
              count: currentCredits,
            })}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {CREDIT_BUNDLES.map((bundle) => {
          const isLoading = loadingId === bundle.id;
          return (
            <Card key={bundle.id} className="space-y-4 p-6">
              <div className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-muted-foreground" />
                <p className="font-medium">{bundle.name}</p>
              </div>
              <p className="text-2xl font-semibold text-foreground">
                {format.number(bundle.credits)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {t("creditBundles.creditsUnit", { count: bundle.credits })}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {t("creditBundles.oneTime", {
                  price: format.number(bundle.priceUsd, {
                    style: "currency",
                    currency: CURRENCY,
                    maximumFractionDigits: 0,
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
          );
        })}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
