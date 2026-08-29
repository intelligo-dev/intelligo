"use client";

/**
 * Client error boundary for the artifacts route. Self-contained per the
 * repo-wide registry standard: no shared app-internal error component,
 * no error-reporting SDK.
 */

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function ArtifactsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("artifacts");

  useEffect(() => {
    console.error("[artifacts] error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{t("error.description")}</AlertDescription>
        </Alert>

        <div className="flex justify-center gap-3">
          <Button onClick={reset}>{t("error.retry")}</Button>
          <Button asChild variant="outline">
            <Link href="/">{t("error.goHome")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
