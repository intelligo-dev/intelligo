import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth-password-reset");
  return {
    title: t("resetPage.metadata.title"),
    description: t("resetPage.metadata.description"),
  };
}

export default async function ResetPasswordPage() {
  const t = await getTranslations("auth-password-reset");

  return (
    <AuthCard
      title={t("resetPage.card.title")}
      description={t("resetPage.card.description")}
    >
      {/* useSearchParams (inside ResetPasswordForm) requires a Suspense
          boundary — it opts the subtree out of full static rendering. */}
      <Suspense
        fallback={
          <div className="text-center text-sm text-muted-foreground">
            {t("resetPage.loading")}
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
