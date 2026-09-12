/**
 * Shared auth page shell — de-branded on purpose.
 *
 * Ships with `auth-login`; `auth-signup`, `auth-password-reset`, and
 * `auth-email-verification` all import it from `@/components/auth/auth-card`
 * once installed (see those items' descriptions for the cross-item
 * dependency). A consumer that wants a logo or product name above the
 * card composes it around this component (or in `app/(auth)/layout.tsx`)
 * rather than editing this file — keeping it unbranded is what lets every
 * auth-* item reuse it as-is.
 */

import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({
  title,
  description,
  children,
  footer,
}: AuthCardProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {children}
          {footer && <div className="mt-6">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
