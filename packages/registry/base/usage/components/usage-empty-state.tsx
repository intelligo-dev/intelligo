import { BarChart3 } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Empty state for the usage surface — deliberately a way forward, not
 * just an absence. A workspace with no usage has never run a turn, so
 * the useful thing to offer is the chat surface that would produce
 * one; a product without a chat surface points `ctaHref` somewhere its
 * own work starts.
 */
export async function UsageEmptyState({
  title,
  description,
  ctaHref = "/chat",
}: {
  title?: string;
  description?: string;
  ctaHref?: string;
}) {
  const t = await getTranslations("usage");

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted">
          <BarChart3 className="size-5 text-muted-foreground" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">{title ?? t("emptyState.defaultTitle")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {description ?? t("emptyState.defaultDescription")}
          </p>
        </div>
        <Button asChild size="sm" className="mt-1">
          <Link href={ctaHref}>{t("emptyState.cta")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
