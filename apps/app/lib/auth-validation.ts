/**
 * Shared client-side validation schemas for the auth-* registry items.
 *
 * Ships with `auth-login`; `auth-signup` and `auth-password-reset` import
 * it from `@/lib/auth-validation` once installed (see those items'
 * descriptions for the cross-item dependency). Plain zod, no
 * `@intelligo-dev/*` imports.
 *
 * Validation copy is user-facing, so these schemas do not carry literal
 * English strings — they carry stable error CODES (plain identifiers, not
 * translated text), and the form component that owns each schema maps a
 * code to `t(\`validation.${code}\`)` under its own registry item's
 * message namespace. A schema file has no component tree to
 * call `useTranslations`/`getTranslations` from, so translation happens
 * one layer up, in the form.
 */

import { z } from "zod";

/** At least one uppercase letter, one lowercase letter, and one digit. */
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

export const loginSchema = z.object({
  email: z.string().email("emailInvalid"),
  password: z.string().min(8, "passwordTooShort"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    name: z.string().min(2, "nameTooShort").max(50, "nameTooLong"),
    email: z.string().email("emailInvalid"),
    password: z
      .string()
      .min(8, "passwordTooShort")
      .max(128, "passwordTooLong")
      .regex(passwordRegex, "passwordWeak"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "passwordMismatch",
    path: ["confirmPassword"],
  });

export type SignupInput = z.infer<typeof signupSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("emailInvalid"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "passwordTooShort")
      .max(128, "passwordTooLong")
      .regex(passwordRegex, "passwordWeak"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "passwordMismatch",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Where to go after signing in: `next` when it is a path on this site,
 * `/dashboard` otherwise. A full URL, or `//host`, would let a link send
 * a reader who just signed in to somebody else's site.
 */
export function returnPath(next: string | null | undefined): string {
  return typeof next === "string" && /^\/(?![/\\])/.test(next)
    ? next
    : "/dashboard";
}
