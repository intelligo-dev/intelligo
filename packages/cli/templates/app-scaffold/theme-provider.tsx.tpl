"use client";

/**
 * Theme provider — mounted by `app/[locale]/layout.tsx` so any theme
 * switcher (e.g. the app-shell item's user menu) actually works.
 *
 * The same file ships with the `app-shell` registry item at the same
 * path; installing app-shell simply overwrites this copy with an
 * identical one. Defaults: class-attribute strategy (Tailwind's `.dark`
 * tokens), system preference honored, no transition flash on switch.
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
