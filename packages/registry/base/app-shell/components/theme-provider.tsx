"use client";

/**
 * Theme provider — the mount that makes the user-menu's Light/Dark/
 * System submenu actually do something.
 *
 * The user menu (`user-menu.tsx`) drives `next-themes`' `useTheme()`,
 * which is inert until a `<ThemeProvider>` is mounted above it. This
 * item can't ship the root layout (that file is scaffold/consumer
 * territory — it owns fonts, providers, and `<html>` attributes), so
 * mounting is one manual step, done once:
 *
 *   // app/[locale]/layout.tsx
 *   import { ThemeProvider } from "@/components/shell/theme-provider";
 *   <html lang={locale} suppressHydrationWarning>
 *     <body>
 *       <ThemeProvider>{children}</ThemeProvider>
 *     </body>
 *   </html>
 *
 * (`suppressHydrationWarning` on `<html>` is next-themes' documented
 * requirement — the class attribute is set before hydration.)
 *
 * Defaults: class-attribute strategy (Tailwind's `.dark` tokens),
 * system preference honored, no transition flash on switch. Override
 * per deployment by passing props through this wrapper.
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
