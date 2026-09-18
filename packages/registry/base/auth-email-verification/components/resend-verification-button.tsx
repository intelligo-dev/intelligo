"use client";

/**
 * Resends a verification email through Better-Auth's
 * `sendVerificationEmail`. The endpoint works with or without a session
 * and answers the same whether or not the address is registered. When
 * `email` is passed (e.g. from the signup redirect's `?email=`) this
 * renders just the button; otherwise it asks for the address first.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

import { authClient } from "@intelligo-dev/auth/client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

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
        <Field>
          <FieldLabel htmlFor="resend-email">
            {t("resend.emailLabel")}
          </FieldLabel>
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
        </Field>
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
        aria-busy={isResending || undefined}
      >
        {isResending ? (
          <>
            <Spinner data-icon="inline-start" />
            {t("resend.sending")}
          </>
        ) : resendSuccess ? (
          t("resend.sent")
        ) : (
          t("resend.submit")
        )}
      </Button>
    </div>
  );
}
