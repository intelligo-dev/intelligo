/**
 * Onboarding layout — minimal, centered, no sidebar or nav.
 *
 * Installs at `app/onboarding/*`, a sibling of `(app)`, not a route
 * inside it — see the `app-shell` item's `layout.tsx` doc comment for
 * why: the authenticated shell's onboarding-completion redirect never
 * wraps this route, so it can never redirect into itself. If your
 * product nests onboarding under `(app)` instead, add a route check
 * before that redirect fires.
 */

import type { ReactNode } from "react";

export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      {children}
    </div>
  );
}
