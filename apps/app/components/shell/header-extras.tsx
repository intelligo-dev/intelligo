"use client";

/**
 * The reference app's `headerRight` binding for the app-shell's
 * `ShellConfig` seam: the notification bell and the locale switcher,
 * side by side at the right end of the shell header. Both are
 * self-contained — the bell fetches its own data, the switcher reads
 * the active locale itself (and renders nothing in this en-only
 * deployment until a second locale is added to `i18n/routing.ts`) — so
 * this composite takes no props, as the seam requires.
 */

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";

export function HeaderExtras() {
  return (
    <>
      <LanguageSwitcher />
      <NotificationBell />
    </>
  );
}
