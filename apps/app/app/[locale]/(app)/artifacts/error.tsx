"use client";

/** Error boundary for the artifacts route. */

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
    <div className="flex min-h-96 items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{t("error.description")}</AlertDescription>
        </Alert>

        <div className="flex justify-center gap-3">
          <Button onClick={reset}>{t("error.retry")}</Button>
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
