"use client";

/**
 * Password reset completion form — reached by clicking the emailed
 * link. Better-Auth's own `/reset-password/:token` redirect appends
 * `?token=<value>` on a valid token or `?error=INVALID_TOKEN` /
 * `?error=TOKEN_EXPIRED` on an invalid/expired one, so both states are
 * read from search params rather than assumed. Calls the Better-Auth
 * client SDK's `resetPassword` action directly — no raw
 * `fetch("/api/auth/*")`.
 */

import { useState } from "react";
import { useSearchParams } from "@showcase/shims/next-navigation";
import { useTranslations } from "use-intl";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { authClient } from "@showcase/shims/auth-client";

import { useRouter } from "@showcase/i18n/navigation";
import { Alert, AlertDescription } from "@showcase/components/ui/alert";
import { Button } from "@showcase/components/ui/button";
import { Input } from "@showcase/components/ui/input";
import { Field, FieldError, FieldLabel } from "@showcase/components/ui/field";
import { Spinner } from "@showcase/components/ui/spinner";
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@showcase/lib/auth-validation";

export function ResetPasswordForm() {
  const t = useTranslations("auth-password-reset");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const linkError = searchParams.get("error");

  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  });

  async function onSubmit(data: ResetPasswordInput) {
    if (!token) {
      setFormError(t("resetForm.errors.invalidLink"));
      return;
    }

    try {
      setFormError(null);
      setIsLoading(true);

      const result = await authClient.resetPassword({
        newPassword: data.password,
        token,
      });

      if (result.error) {
        setFormError(result.error.message ?? t("resetForm.errors.invalidLink"));
        setIsLoading(false);
        return;
      }

      router.push("/login?reset=success");
    } catch (error) {
      console.error("Reset password error:", error);
      setFormError(t("resetForm.errors.invalidLink"));
      setIsLoading(false);
    }
  }

  if (!token || linkError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {t("resetForm.errors.invalidLinkFromForgotPage")}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Field data-invalid={errors.password ? true : undefined}>
        <FieldLabel htmlFor="password">
          {t("resetForm.passwordLabel")}
        </FieldLabel>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          disabled={isLoading}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-error" : undefined}
          {...register("password")}
        />
        {errors.password && (
          <FieldError id="password-error">
            {t(`validation.${errors.password.message}`)}
          </FieldError>
        )}
      </Field>

      <Field data-invalid={errors.confirmPassword ? true : undefined}>
        <FieldLabel htmlFor="confirmPassword">
          {t("resetForm.confirmPasswordLabel")}
        </FieldLabel>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          disabled={isLoading}
          aria-invalid={errors.confirmPassword ? true : undefined}
          aria-describedby={
            errors.confirmPassword ? "confirm-password-error" : undefined
          }
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <FieldError id="confirm-password-error">
            {t(`validation.${errors.confirmPassword.message}`)}
          </FieldError>
        )}
      </Field>

      <Button
        type="submit"
        className="w-full"
        disabled={isLoading}
        aria-busy={isLoading || undefined}
      >
        {isLoading ? (
          <>
            <Spinner data-icon="inline-start" />
            {t("resetForm.submitting")}
          </>
        ) : (
          t("resetForm.submit")
        )}
      </Button>
    </form>
  );
}
