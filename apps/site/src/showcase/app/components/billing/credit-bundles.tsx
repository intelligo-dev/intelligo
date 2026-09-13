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
 *
 * The bundle price is NOT formatted with `CURRENCY`. `CreditBundle`'s
 * amount field is `priceUsd`, and `createCreditCheckout` charges it
 * through Stripe with `currency: "usd"` — so the number on this card is
 * a US dollar amount whatever the deployment's ledger currency is.
 * Formatting it with `CURRENCY` printed a $1.01 pack as "₮1" in the
 * first non-USD deployment: right glyph, wrong money, and rounded to
 * nothing by `maximumFractionDigits: 0`. `CURRENCY` stays correct for
 * balances and usage, which really are in the ledger unit.
 *
 * This is an interim honesty fix. The real repair is a `CreditBundle`
 * that carries its own currency on both the price and the grant, so the
 * two can never be read in each other's unit.
 */

import { useState } from "react";
import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "use-intl";

import { Alert, AlertDescription } from "@showcase/components/ui/alert";
import { Button } from "@showcase/components/ui/button";
import { Card } from "@showcase/components/ui/card";

import { createCreditPurchaseSession } from "@showcase/actions/billing";
import { CREDIT_BUNDLES } from "@showcase/lib/billing-config";

/**
 * The currency `CreditBundle.priceUsd` is denominated in, and the one
 * `createCreditCheckout` passes to Stripe. Fixed by the framework
 * today, not a deployment choice — hence a constant here rather than a
 * value read from `@/lib/billing-config`.
 */
const BUNDLE_PRICE_CURRENCY = "USD";

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
                <Coins className="size-5 text-muted-foreground" />
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
                    currency: BUNDLE_PRICE_CURRENCY,
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
