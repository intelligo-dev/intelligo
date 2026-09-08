"use client";

/**
 * Locale switcher — a dropdown over the locales your `i18n/routing.ts`
 * declares. The registry's items are i18n-native (ADR-0010) but nothing
 * else in the catalogue lets the user actually change language; this
 * closes that gap.
 *
 * Zero config: locales come from `routing.locales`, and each option is
 * labeled with the language's own name (endonym) via
 * `Intl.DisplayNames` — "English", "Монгол" — so adding a locale to
 * `routing.ts` + a `messages/<locale>/` directory is the whole job.
 * In a single-locale deployment this renders nothing, which makes it
 * safe to mount unconditionally (e.g. in `shellConfig.headerRight`).
 *
 * Switching navigates to the same pathname under the new locale via
 * `@/i18n/navigation`'s `router.replace` — next-intl's middleware
 * persists the choice in its locale cookie from there.
 */

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { routing } from "@showcase/i18n/routing";
import { usePathname, useRouter } from "@showcase/i18n/navigation";
import { Button } from "@showcase/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@showcase/components/ui/dropdown-menu";

function endonym(code: string): string {
  try {
    const label = new Intl.DisplayNames([code], { type: "language" }).of(code);
    if (!label) return code;
    return label.charAt(0).toLocaleUpperCase(code) + label.slice(1);
  } catch {
    return code;
  }
}

export function LanguageSwitcher() {
  const t = useTranslations("language-switcher");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const locales: readonly string[] = routing.locales;
  if (locales.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label={t("label")}
        >
          <Languages className="h-4 w-4" />
          <span className="sr-only">{t("label")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((code) => (
          <DropdownMenuItem
            key={code}
            onClick={() => router.replace(pathname, { locale: code })}
            className={code === locale ? "bg-accent font-medium" : ""}
          >
            {endonym(code)}
            {code === locale && (
              <span className="ml-auto text-xs text-muted-foreground">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
