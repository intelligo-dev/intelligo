/**
 * Minimal centered layout shared by every auth-* route: no nav, no
 * sidebar, just the page content. Each auth-* page composes its own
 * `AuthCard` inside this shell.
 */

import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
