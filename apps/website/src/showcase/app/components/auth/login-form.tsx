"use client";

/**
 * Email + password login form. Calls the Better-Auth client SDK
 * (`@intelligo-dev/auth/client`) directly — no raw `fetch("/api/auth/*")`.
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
import { loginSchema, type LoginInput } from "@showcase/lib/auth-validation";

/** `next`: where to go once signed in — a path on this site. */
export function LoginForm({ next = "/dashboard" }: { next?: string }) {
  const t = useTranslations("auth-login");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginInput) {
    try {
      setFormError(null);
      setIsLoading(true);

      const result = await authClient.signIn.email({
        email: data.email,
        password: data.password,
        callbackURL: next,
      });

      if (result.error) {
        setFormError(
          result.error.message ?? t("loginForm.errors.invalidCredentials")
        );
        setIsLoading(false);
        return;
      }

      router.push(next);
    } catch (error) {
      console.error("Login error:", error);
      setFormError(t("loginForm.errors.unexpected"));
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

      <Field data-invalid={errors.email ? true : undefined}>
        <FieldLabel htmlFor="email">{t("loginForm.emailLabel")}</FieldLabel>
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
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor="password">
            {t("loginForm.passwordLabel")}
          </FieldLabel>
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-primary hover:text-primary/80"
          >
            {t("loginForm.forgotPassword")}
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
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

      <Button
        type="submit"
        className="w-full"
        disabled={isLoading}
        aria-busy={isLoading || undefined}
      >
        {isLoading ? (
          <>
            <Spinner data-icon="inline-start" />
            {t("loginForm.submitting")}
          </>
        ) : (
          t("loginForm.submit")
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("loginForm.noAccount")}{" "}
        <Link
          href={
            next === "/dashboard"
              ? "/signup"
              : `/signup?next=${encodeURIComponent(next)}`
          }
          className="font-medium text-primary hover:text-primary/80"
        >
          {t("loginForm.signUpLink")}
        </Link>
      </p>
    </form>
  );
}
