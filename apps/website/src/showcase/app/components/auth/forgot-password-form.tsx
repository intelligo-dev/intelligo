"use client";

/**
 * Email-only form that starts the password reset flow through
 * Better-Auth's `requestPasswordReset`. `redirectTo` is where the
 * emailed link lands: `/reset-password?token=...` on a valid token,
 * `/reset-password?error=INVALID_TOKEN` on an expired or invalid one.
 */

import { useState } from "react";
import { useTranslations } from "use-intl";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { authClient } from "@showcase/shims/auth-client";

import { Link } from "@showcase/i18n/navigation";
import { Alert, AlertDescription } from "@showcase/components/ui/alert";
import { Button } from "@showcase/components/ui/button";
import { Input } from "@showcase/components/ui/input";
import { Field, FieldError, FieldLabel } from "@showcase/components/ui/field";
import { Spinner } from "@showcase/components/ui/spinner";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@showcase/lib/auth-validation";

export function ForgotPasswordForm() {
  const t = useTranslations("auth-password-reset");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit(data: ForgotPasswordInput) {
    try {
      setFormError(null);
      setIsLoading(true);

      const result = await authClient.requestPasswordReset({
        email: data.email,
        redirectTo: "/reset-password",
      });

      if (result.error) {
        setFormError(result.error.message ?? t("forgotForm.errors.unexpected"));
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setIsLoading(false);
    } catch (error) {
      console.error("Forgot password error:", error);
      setFormError(t("forgotForm.errors.unexpected"));
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertDescription>{t("forgotForm.successMessage")}</AlertDescription>
        </Alert>
        <Button
          variant="outline"
          className="w-full"
          render={<Link href="/login" />}
          nativeButton={false}
        >
          {t("forgotForm.backToLogin")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Field data-invalid={errors.email ? true : undefined}>
        <FieldLabel htmlFor="email">{t("forgotForm.emailLabel")}</FieldLabel>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          disabled={isLoading}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")}
        />
        {errors.email && (
          <FieldError id="email-error">
            {t(`validation.${errors.email.message}`)}
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
            {t("forgotForm.submitting")}
          </>
        ) : (
          t("forgotForm.submit")
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("forgotForm.rememberPassword")}{" "}
        <Link
          href="/login"
          className="font-medium text-primary hover:text-primary/80"
        >
          {t("forgotForm.logInLink")}
        </Link>
      </p>
    </form>
  );
}
