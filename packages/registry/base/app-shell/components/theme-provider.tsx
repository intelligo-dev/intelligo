"use client";

/**
 * The user menu's Light/Dark/System submenu drives `next-themes`, which
 * is inert until this provider is mounted above it. The root layout is
 * yours, so mounting it is one manual step:
 *
 *   // app/[locale]/layout.tsx
 *   import { ThemeProvider } from "@/components/shell/theme-provider";
 *   <html lang={locale} suppressHydrationWarning>
 *     <body>
 *       <ThemeProvider>{children}</ThemeProvider>
 *     </body>
 *   </html>
 *
 * `suppressHydrationWarning` is required: next-themes sets the class
 * attribute before hydration.
 *
 * Defaults: class strategy (Tailwind's `.dark` tokens), system preference
 * honoured, no transition on switch. Props pass through to override them.
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
