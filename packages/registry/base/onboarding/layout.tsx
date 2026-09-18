/**
 * Centred layout with no sidebar. It sits beside `(app)`, not inside it,
 * so the shell's redirect to onboarding never wraps this route. If you
 * move it under `(app)`, skip that redirect on this route.
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
