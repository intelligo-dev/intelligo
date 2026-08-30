"use client";

/**
 * Theme provider — mounted by `app/[locale]/layout.tsx` so any theme
 * switcher (e.g. the app-shell item's user menu) actually works.
 *
 * The `app-shell` registry item ships its own provider at this same
 * path; installing app-shell (with --overwrite) replaces this starter
 * copy, and the manifest will report the file as customized from then
 * on — that is expected. Defaults: class-attribute strategy (Tailwind's
 * `.dark` tokens), system preference honored, no transition flash on
 * switch.
 */

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
