"use client";

/**
 * OAuth provider buttons — renders only the providers the server page
 * passes in via `providers` (see `page.tsx`: the env-var check is
 * server-side, so a provider with no client id/secret configured never
 * reaches the client at all). Calls the Better-Auth client SDK directly;
 * no raw `fetch("/api/auth/*")`.
 *
 * Ships with `auth-login`; `auth-signup` reuses this same file from
 * `@/components/auth/social-login-buttons` once installed, so its copy
 * text lives under the `auth-login` message namespace regardless of
 * which page renders it — see that item's description for the
 * cross-item dependency.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { authClient } from "@intelligo/auth/client";

import { Button } from "@/components/ui/button";

type Provider = "google" | "github";

interface SocialLoginButtonsProps {
  providers: string[];
}

export function SocialLoginButtons({ providers }: SocialLoginButtonsProps) {
  const t = useTranslations("auth-login");
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);

  if (providers.length === 0) {
    return null;
  }

  async function handleSocialLogin(provider: Provider) {
    try {
      setLoadingProvider(provider);
      await authClient.signIn.social({
        provider,
        callbackURL: "/dashboard",
      });
    } catch (error) {
      console.error(`${provider} login error:`, error);
      setLoadingProvider(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        {providers.includes("google") && (
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSocialLogin("google")}
            disabled={loadingProvider !== null}
            className="w-full"
          >
            {loadingProvider === "google" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 18 18"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
                  fill="#4285F4"
                />
                <path
                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
                  fill="#34A853"
                />
                <path
                  d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
                  fill="#FBBC05"
                />
                <path
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z"
                  fill="#EA4335"
                />
              </svg>
            )}
            {loadingProvider === "google"
              ? t("socialLogin.connecting")
              : t("socialLogin.continueWithGoogle")}
          </Button>
        )}

        {providers.includes("github") && (
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSocialLogin("github")}
            disabled={loadingProvider !== null}
            className="w-full"
          >
            {loadingProvider === "github" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg
                className="h-4 w-4"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            )}
            {loadingProvider === "github"
              ? t("socialLogin.connecting")
              : t("socialLogin.continueWithGithub")}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("socialLogin.orContinueWith")}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
