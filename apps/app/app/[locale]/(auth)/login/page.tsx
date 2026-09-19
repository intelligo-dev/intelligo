import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { getAuthSession } from "@intelligo-dev/auth";

import { redirect } from "@/i18n/navigation";
import { returnPath } from "@/lib/auth-validation";
import { AuthCard } from "@/components/auth/auth-card";
import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { LoginForm } from "@/components/auth/login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth-login");
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
async function redirectIfSignedIn(next: string): Promise<void> {
  if (await getAuthSession())
    redirect({ href: next, locale: await getLocale() });
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  // Where the reader was going — an invitation link, say — when they
  // were sent here to sign in.
  const raw = (await searchParams).next;
  const next = returnPath(Array.isArray(raw) ? raw[0] : raw);
  await redirectIfSignedIn(next);

  const t = await getTranslations("auth-login");

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
        <SocialLoginButtons providers={providers} next={next} />
        <LoginForm next={next} />
      </div>
    </AuthCard>
  );
}
