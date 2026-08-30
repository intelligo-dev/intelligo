"use client";

/**
 * Email + password login form. Calls the Better-Auth client SDK
 * (`@intelligo-dev/auth/client`) directly — no raw `fetch("/api/auth/*")`.
 */

import { useState } from "react";
import { useTranslations } from "use-intl";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";

import { authClient } from "@showcase/shims/auth-client";

import { Link, useRouter } from "@showcase/i18n/navigation";
import { Alert, AlertDescription } from "@showcase/components/ui/alert";
import { Button } from "@showcase/components/ui/button";
import { Input } from "@showcase/components/ui/input";
import { Label } from "@showcase/components/ui/label";
import { loginSchema, type LoginInput } from "@showcase/lib/auth-validation";

export function LoginForm() {
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
        callbackURL: "/dashboard",
      });

      if (result.error) {
        setFormError(
          result.error.message ?? t("loginForm.errors.invalidCredentials")
        );
        setIsLoading(false);
        return;
      }

      router.push("/dashboard");
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

      <div className="space-y-2">
        <Label htmlFor="email">{t("loginForm.emailLabel")}</Label>
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
          <p id="email-error" className="text-sm text-destructive">
            {t(`validation.${errors.email.message}`)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t("loginForm.passwordLabel")}</Label>
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
          <p id="password-error" className="text-sm text-destructive">
            {t(`validation.${errors.password.message}`)}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("loginForm.submitting")}
          </span>
        ) : (
          t("loginForm.submit")
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("loginForm.noAccount")}{" "}
        <Link
          href="/signup"
          className="font-medium text-primary hover:text-primary/80"
        >
          {t("loginForm.signUpLink")}
        </Link>
      </p>
    </form>
  );
}
