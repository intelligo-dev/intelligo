import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { getAuthSession, getPendingDeletion } from "@intelligo-dev/auth";

import { redirect } from "@/i18n/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { RestoreAccountForm } from "@/components/auth/restore-account-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth-login");
  return { title: t("restore.metadataTitle") };
}

/**
 * Where a signed-in account scheduled for deletion lands: the app's
 * layout sends it here, because every other page treats its session as
 * signed out. Restoring needs a confirmation; until then nothing else is
 * reachable. A visitor with no such account has no use for the page.
 */
export default async function RestoreAccountPage() {
  const locale = await getLocale();
  const pending = await getPendingDeletion();
  if (!pending) {
    const signedIn = await getAuthSession();
    redirect({ href: signedIn ? "/dashboard" : "/login", locale });
    return null;
  }

  const t = await getTranslations("auth-login");
  const format = await getFormatter();
  const date = format.dateTime(pending.restorableUntil, { dateStyle: "long" });

  return (
    <AuthCard
      title={t("restore.title")}
      description={
        pending.restorable
          ? t("restore.description", { email: pending.email, date })
          : t("restore.expired", { email: pending.email })
      }
    >
      <RestoreAccountForm restorable={pending.restorable} />
    </AuthCard>
  );
}
