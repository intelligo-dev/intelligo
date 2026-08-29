import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { getAuthSession } from "@intelligo/auth";

import { redirect } from "@/i18n/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { SignupForm } from "@/components/auth/signup-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth-signup");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

/**
 * A signed-in visitor has no use for this page.
 *
 * Done here rather than in middleware because middleware only sees the
 * session cookie, not the session. Redirecting on the cookie while the
 * authenticated app layout redirects on the real session is an infinite
 * loop for anyone holding a stale one — revoked elsewhere, expired row,
 * rotated secret — and the loop locks them out of the page that would
 * fix it.
 */
async function redirectIfSignedIn(): Promise<void> {
  if (await getAuthSession())
    redirect({ href: "/dashboard", locale: await getLocale() });
}

export default async function SignupPage() {
  await redirectIfSignedIn();

  const t = await getTranslations("auth-signup");

  // OAuth provider buttons only render for providers actually configured
  // on the server — checked here, not in the client component, so an
  // unconfigured client id/secret never reaches the browser at all.
  const providers: string[] = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push("google");
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push("github");
  }

  return (
    <AuthCard title={t("card.title")} description={t("card.description")}>
      <div className="space-y-6">
        <SocialLoginButtons providers={providers} />
        <SignupForm />
      </div>
    </AuthCard>
  );
}
