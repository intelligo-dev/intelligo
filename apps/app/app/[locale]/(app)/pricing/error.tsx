"use client";

/**
 * Client error boundary for the pricing route. Self-contained per the
 * repo-wide registry standard: no shared app-internal error component,
 * no error-reporting SDK.
 */

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function PricingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("pricing");

  useEffect(() => {
    console.error("[pricing] error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{t("error.title")}</AlertDescription>
        </Alert>

        <div className="flex justify-center gap-3">
          <Button onClick={reset}>{t("error.tryAgain")}</Button>
          <Button
            variant="outline"
            render={<Link href="/" />}
            nativeButton={false}
          >
            {t("error.goHome")}
          </Button>
        </div>
      </div>
    </div>
  );
}
