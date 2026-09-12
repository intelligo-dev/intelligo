import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth-password-reset");
  return {
    title: t("forgotPage.metadata.title"),
    description: t("forgotPage.metadata.description"),
  };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth-password-reset");

  return (
    <AuthCard
      title={t("forgotPage.card.title")}
      description={t("forgotPage.card.description")}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
