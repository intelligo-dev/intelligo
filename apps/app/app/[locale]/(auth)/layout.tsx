import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

const SKIP_LINK_CLASS =
  "sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:border focus:border-ring focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:outline-none focus:ring-3 focus:ring-ring/40";

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations("auth-login");
  return (
    <>
      <a href="#main-content" className={SKIP_LINK_CLASS}>
        {t("skipToContent")}
      </a>
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-screen bg-background outline-none"
      >
        {children}
      </main>
    </>
  );
}
