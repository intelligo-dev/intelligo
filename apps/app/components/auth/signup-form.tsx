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
import { useTranslations } from "next-intl";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";

import { authClient } from "@intelligo-dev/auth/client";

import { Link, useRouter } from "@/i18n/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupSchema, type SignupInput } from "@/lib/auth-validation";

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

      <div className="space-y-2">
        <Label htmlFor="name">{t("signupForm.nameLabel")}</Label>
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
          <p id="name-error" className="text-sm text-destructive">
            {t(`validation.${errors.name.message}`)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{t("signupForm.emailLabel")}</Label>
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
        <Label htmlFor="password">{t("signupForm.passwordLabel")}</Label>
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
          <p id="password-error" className="text-sm text-destructive">
            {t(`validation.${errors.password.message}`)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">
          {t("signupForm.confirmPasswordLabel")}
        </Label>
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
          <p id="confirm-password-error" className="text-sm text-destructive">
            {t(`validation.${errors.confirmPassword.message}`)}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("signupForm.submitting")}
          </span>
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
