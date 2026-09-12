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
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";

import { authClient } from "@intelligo-dev/auth/client";

import { useRouter } from "@/i18n/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/lib/auth-validation";

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

      <div className="space-y-2">
        <Label htmlFor="password">{t("resetForm.passwordLabel")}</Label>
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
          {t("resetForm.confirmPasswordLabel")}
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
            {t("resetForm.submitting")}
          </span>
        ) : (
          t("resetForm.submit")
        )}
      </Button>
    </form>
  );
}
