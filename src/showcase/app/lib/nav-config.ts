/**
 * Sidebar nav config — consumer-owned, imported directly by the client
 * `AppSidebar` (never passed through a Server Component: icons are
 * React components, which cannot cross the server->client boundary).
 *
 * `titleKey`s point into the `app-shell` namespace
 * (`messages/<locale>/app-shell.json`) — add your own keys there when
 * you add routes. The shipped default covers every top-level surface
 * the registry catalogue installs — the product ones first (chat,
 * artifacts), the account ones after — so a full install is navigable
 * out of the box. Team/workspace/profile/privacy/billing settings are
 * reached through the Settings entry (the `settings-shell` item's tab
 * bar), not as their own sidebar rows.
 *
 * Installing a subset? Delete the rows whose routes you didn't
 * install — a nav entry pointing at a missing route is a 404.
 */

import {
  BarChart3,
  Bell,
  CreditCard,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Settings,
} from "lucide-react";

import type { NavItem } from "@showcase/components/shell/app-sidebar";

export const navItems: NavItem[] = [
  {
    titleKey: "sidebar.nav.dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  { titleKey: "sidebar.nav.chat", href: "/chat", icon: MessageSquare },
  { titleKey: "sidebar.nav.artifacts", href: "/artifacts", icon: FileText },
  { titleKey: "sidebar.nav.usage", href: "/usage", icon: BarChart3 },
  {
    titleKey: "sidebar.nav.notifications",
    href: "/notifications",
    icon: Bell,
  },
  { titleKey: "sidebar.nav.pricing", href: "/pricing", icon: CreditCard },
  { titleKey: "sidebar.nav.settings", href: "/settings", icon: Settings },
];
