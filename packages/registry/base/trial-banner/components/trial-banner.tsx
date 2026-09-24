"use client";

/**
 * Trial banner — a dismissable strip above the app shell's content
 * showing days and credits remaining, with an upgrade CTA.
 *
 * Urgency ramps the visual weight with semantic tokens: normal (>3 days) sits on `primary`, warning (≤3 days) on
 * `foreground`/`muted`, urgent (≤1 day) on `destructive`. Dismissing
 * hides the banner for the rest of the day (localStorage; per-browser,
 * deliberately not server state — a nudge, not a notification).
 *
 * `trialBannerConfig` (consumer-owned `lib/trial-banner-config.ts`)
 * decides where the upgrade CTA points and which route prefixes
 * suppress the banner entirely — the default keeps it out of `/chat`,
 * where a persistent strip over a conversation costs the most.
 */

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { trialBannerConfig } from "@/lib/trial-banner-config";

const DISMISSED_KEY = "trial-banner-dismissed";

/** Local calendar day, as a stable `YYYY-MM-DD` storage key. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type TrialBannerProps = {
  daysRemaining: number;
  /**
   * Credit counts already formatted for display, by the server
   * (`TrialBannerContainer`). Formatting them here would run Intl twice —
   * Node's ICU during SSR, the browser's at hydration — and the two
   * disagree on compact notation for many locales.
   */
  creditsRemaining: string;
  initialCredits: string;
};

export function TrialBanner({
  daysRemaining,
  creditsRemaining,
  initialCredits,
}: TrialBannerProps) {
  const t = useTranslations("trial-banner");
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);

  // Dismissed-today check runs in an effect: localStorage doesn't exist
  // during SSR, and reading it during render would desync hydration.
  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY) === today()) {
      setIsVisible(false);
    }
  }, []);

  const hidden = trialBannerConfig.hideOnPaths.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (hidden || !isVisible) return null;

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, today());
    setIsVisible(false);
  }

  const isUrgent = daysRemaining <= 1;
  const isWarning = daysRemaining > 1 && daysRemaining <= 3;

  const strip = isUrgent
    ? "bg-destructive/10 border-destructive/20"
    : isWarning
      ? "bg-muted border-border"
      : "bg-primary/5 border-primary/20";
  const accent = isUrgent
    ? "text-destructive"
    : isWarning
      ? "text-foreground"
      : "text-primary";
  const chip = isUrgent
    ? "bg-destructive/10 text-destructive"
    : isWarning
      ? "bg-foreground/10 text-foreground"
      : "bg-primary/10 text-primary";

  return (
    <div className={`relative w-full border-b transition-colors ${strip}`}>
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Sparkles className={`size-5 ${accent}`} aria-hidden />
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${chip}`}
                >
                  {t("label")}
                </span>
                <span className={`text-sm font-semibold ${accent}`}>
                  {daysRemaining === 0
                    ? t("expiresToday")
                    : t("daysRemaining", { days: daysRemaining })}
                </span>
              </div>
              <span className={`text-xs ${accent}`}>
                {t("creditsLeft", {
                  remaining: creditsRemaining,
                  initial: initialCredits,
                })}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={isUrgent ? "destructive" : "default"}
              render={<Link href={trialBannerConfig.upgradeHref} />}
              nativeButton={false}
            >
              {t("upgrade")}
            </Button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted"
              aria-label={t("dismiss")}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
