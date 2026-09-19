/**
 * Settings tab configuration — consumer-owned (same contract as
 * `lib/nav-config.ts` for the app sidebar).
 *
 * `settings-tabs.tsx` renders exactly this list, in this order. Add a
 * product tab (`{ value: "ai", href: "/settings/ai", titleKey:
 * "settings.tabAI", icon: Brain }`), remove one your product doesn't
 * sell, or reorder — no component edit needed.
 *
 * `titleKey` is a fully-qualified message key resolved through a
 * namespace-less `useTranslations()` (the `chatConfig.starters`
 * contract): the defaults point into this item's `settings-shell`
 * namespace (`messages/<locale>/settings-shell.json`), and a tab you
 * add can point into any namespace you own.
 *
 * Icons are Lucide components. They live here — a client-imported
 * config file — rather than being passed from a server layout, because
 * component values can't cross the RSC boundary as props (see
 * `nav-config.ts`).
 */

import {
  CreditCard,
  Settings,
  Shield,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface SettingsTab {
  /** Stable identity for the active-tab highlight. */
  value: string;
  /** Locale-less href; `@/i18n/navigation`'s Link localizes it. */
  href: string;
  /** Fully-qualified message key for the tab label. */
  titleKey: string;
  icon: LucideIcon;
}

export const settingsTabs: SettingsTab[] = [
  {
    value: "profile",
    href: "/settings/profile",
    titleKey: "settings-shell.tabs.profile",
    icon: User,
  },
  {
    value: "billing",
    href: "/settings/billing",
    titleKey: "settings-shell.tabs.billing",
    icon: CreditCard,
  },
  {
    value: "privacy",
    href: "/settings/privacy",
    titleKey: "settings-shell.tabs.privacy",
    icon: Shield,
  },
  {
    value: "team",
    href: "/settings/team",
    titleKey: "settings-shell.tabs.team",
    icon: Users,
  },
  {
    value: "workspace",
    href: "/settings/workspace",
    titleKey: "settings-shell.tabs.workspace",
    icon: Settings,
  },
];
