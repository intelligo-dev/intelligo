import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { getAuthSession } from "@intelligo/auth";

import { Link } from "@/i18n/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ResendVerificationButton } from "@/components/auth/resend-verification-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth-email-verification");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

interface Props {
  searchParams: Promise<{ error?: string; email?: string }>;
}

/**
 * Better-Auth's `/verify-email` link handler (clicked from the emailed
 * link, not called from this page) redirects back here with `?error=CODE`
 * on an invalid/expired/unknown token, or with no query param at all —
 * plus a fresh session cookie — on success. That gives this page three
 * honestly distinguishable states without guessing: verified (a session
 * exists), failed (an `error` code came back), or still pending (neither
 * — the visitor hasn't clicked the link yet).
 */
function errorMessageFor(
  error: string | undefined,
  t: Awaited<ReturnType<typeof getTranslations>>
): string | null {
  if (!error) return null;
  const knownCodes = ["INVALID_TOKEN", "TOKEN_EXPIRED", "USER_NOT_FOUND"];
  const key = knownCodes.includes(error) ? error : "UNKNOWN";
  return t(`errors.${key}`);
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { error, email } = await searchParams;
  const authSession = await getAuthSession();
  const t = await getTranslations("auth-email-verification");

  if (authSession?.user.emailVerified) {
    return (
      <AuthCard
        title={t("verifiedState.title")}
        description={t("verifiedState.description")}
      >
        <div className="space-y-4">
          <Alert>
            <AlertDescription>{t("verifiedState.message")}</AlertDescription>
          </Alert>
          <Link
            href="/dashboard"
            className="block text-center text-sm font-medium text-primary hover:text-primary/80"
          >
            {t("verifiedState.dashboardLink")}
          </Link>
        </div>
      </AuthCard>
    );
  }

  const errorMessage = errorMessageFor(error, t);

  return (
    <AuthCard
      title={errorMessage ? t("failedState.title") : t("pendingState.title")}
      description={errorMessage ?? t("pendingState.description")}
    >
      <div className="space-y-4">
        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <ResendVerificationButton email={email} />

        <div className="text-center">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-primary"
          >
            {t("backToLogin")}
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}
