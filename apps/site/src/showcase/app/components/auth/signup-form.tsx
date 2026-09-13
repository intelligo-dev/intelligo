"use client";

/**
 * Name + email + password + confirm registration form. Calls the
 * Better-Auth client SDK (`@intelligo-dev/auth/client`) directly — no raw
 * `fetch("/api/auth/*")`.
 *
 * Post-signup routing depends on whether the server has email
 * verification turned on (`emailAndPassword.requireEmailVerification`
 * in `@intelligo-dev/auth`'s server config). When it's on, `signUp.email()`
 * creates the user but returns `token: null` — no session — instead of
 * signing them in, so this form sends the visitor to `/verify-email`
 * with their address instead of the dashboard. When it's off (or the
 * address is exempt), a session comes back immediately and the form
 * goes straight to the dashboard.
 */

import { useState } from "react";
import { useTranslations } from "use-intl";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { authClient } from "@showcase/shims/auth-client";

import { Link, useRouter } from "@showcase/i18n/navigation";
import { Alert, AlertDescription } from "@showcase/components/ui/alert";
import { Button } from "@showcase/components/ui/button";
import { Input } from "@showcase/components/ui/input";
import { Field, FieldError, FieldLabel } from "@showcase/components/ui/field";
import { Spinner } from "@showcase/components/ui/spinner";
import { signupSchema, type SignupInput } from "@showcase/lib/auth-validation";

export function SignupForm() {
  const t = useTranslations("auth-signup");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
  });

  async function onSubmit(data: SignupInput) {
    try {
      setFormError(null);
      setIsLoading(true);

      const result = await authClient.signUp.email({
        name: data.name,
        email: data.email,
        password: data.password,
        callbackURL: "/dashboard",
      });

      if (result.error) {
        setFormError(
          result.error.message?.includes("already")
            ? t("signupForm.errors.accountExists")
            : (result.error.message ?? t("signupForm.errors.unexpected"))
        );
        setIsLoading(false);
        return;
      }

      if (!result.data?.token) {
        router.push(`/verify-email?email=${encodeURIComponent(data.email)}`);
        return;
      }

      router.push("/dashboard");
    } catch (error) {
      console.error("Signup error:", error);
      setFormError(t("signupForm.errors.unexpected"));
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Field data-invalid={errors.name ? true : undefined}>
        <FieldLabel htmlFor="name">{t("signupForm.nameLabel")}</FieldLabel>
        <Input
          id="name"
          type="text"
          autoComplete="name"
          disabled={isLoading}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
          {...register("name")}
        />
        {errors.name && (
          <FieldError id="name-error">
            {t(`validation.${errors.name.message}`)}
          </FieldError>
        )}
      </Field>

      <Field data-invalid={errors.email ? true : undefined}>
        <FieldLabel htmlFor="email">{t("signupForm.emailLabel")}</FieldLabel>
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

      <Field data-invalid={errors.password ? true : undefined}>
        <FieldLabel htmlFor="password">
          {t("signupForm.passwordLabel")}
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
          {t("signupForm.confirmPasswordLabel")}
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
            {t("signupForm.submitting")}
          </>
        ) : (
          t("signupForm.submit")
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("signupForm.alreadyHaveAccount")}{" "}
        <Link
          href="/login"
          className="font-medium text-primary hover:text-primary/80"
        >
          {t("signupForm.logInLink")}
        </Link>
      </p>
    </form>
  );
}
