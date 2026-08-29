"use client";

/**
 * Client-side control for resending a verification email. Calls the
 * Better-Auth client SDK's `sendVerificationEmail` action directly — no
 * raw `fetch("/api/auth/*")`.
 *
 * The endpoint requires an `email` in the request body and works
 * whether or not the visitor has a session (Better-Auth answers with a
 * constant-time "if this email exists…" response either way, so it
 * never leaks whether an address is registered). When the page already
 * knows the address — passed in via `email`, e.g. from the signup
 * redirect's `?email=` search param — this renders just the button;
 * otherwise it asks for the address first.
 */

import { useState } from "react";
import { useTranslations } from "use-intl";
import { Loader2 } from "lucide-react";

import { authClient } from "@showcase/shims/auth-client";

import { Alert, AlertDescription } from "@showcase/components/ui/alert";
import { Button } from "@showcase/components/ui/button";
import { Input } from "@showcase/components/ui/input";
import { Label } from "@showcase/components/ui/label";

interface ResendVerificationButtonProps {
  email?: string;
}

export function ResendVerificationButton({
  email: knownEmail,
}: ResendVerificationButtonProps) {
  const t = useTranslations("auth-email-verification");
  const [email, setEmail] = useState(knownEmail ?? "");
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  async function handleResend() {
    if (!email) {
      setResendError(t("resend.errors.missingEmail"));
      return;
    }

    try {
      setIsResending(true);
      setResendError(null);
      setResendSuccess(false);

      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: "/verify-email",
      });

      if (result.error) {
        setResendError(result.error.message ?? t("resend.errors.unexpected"));
        return;
      }

      setResendSuccess(true);
    } catch (error) {
      console.error("Resend verification error:", error);
      setResendError(t("resend.errors.unexpected"));
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div className="space-y-4">
      {!knownEmail && (
        <div className="space-y-2">
          <Label htmlFor="resend-email">{t("resend.emailLabel")}</Label>
          <Input
            id="resend-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isResending || resendSuccess}
            aria-invalid={resendError ? true : undefined}
            aria-describedby={resendError ? "resend-email-error" : undefined}
          />
        </div>
      )}

      {resendSuccess && (
        <Alert>
          <AlertDescription>{t("resend.success")}</AlertDescription>
        </Alert>
      )}

      {resendError && (
        <Alert id="resend-email-error" variant="destructive">
          <AlertDescription>{resendError}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleResend}
        disabled={isResending || resendSuccess}
      >
        {isResending ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("resend.sending")}
          </span>
        ) : resendSuccess ? (
          t("resend.sent")
        ) : (
          t("resend.submit")
        )}
      </Button>
    </div>
  );
}
