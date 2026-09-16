/**
 * Sidebar nav config — consumer-owned, imported directly by the client
 * `AppSidebar` (never passed through a Server Component: icons are
 * React components, which cannot cross the server->client boundary).
 *
 * Two lists, because the shell has two places to put a link.
 * `navItems` is the sidebar proper: the surfaces a person came here to
 * work in. `accountItems` is the user menu at the foot of the sidebar:
 * what the account costs and what plan it is on — things you go and
 * look at, not things you work in.
 *
 * `titleKey`s point into the `app-shell` namespace
 * (`messages/<locale>/app-shell.json`) — add your own keys there when
 * you add routes.
 *
 * Deliberately in neither list: a Notifications row, because the
 * header's bell already opens that surface, and a Settings row,
 * because the user menu's Profile and Workspace settings entries both
 * land inside `/settings`. Team, workspace, profile, privacy and
 * billing settings are reached through the settings tab bar rather
 * than as rows of their own.
 *
 * Installing a subset? Delete the entries whose routes you didn't
 * install — a nav entry pointing at a missing route is a 404.
 */

import {
  BarChart3,
  CreditCard,
  FileText,
  LayoutDashboard,
  MessageSquare,
} from "lucide-react";

import type { NavItem } from "@showcase/components/shell/app-sidebar";

/** The sidebar: the product's own surfaces. */
export const navItems: NavItem[] = [
  {
    titleKey: "sidebar.nav.dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  { titleKey: "sidebar.nav.chat", href: "/chat", icon: MessageSquare },
  { titleKey: "sidebar.nav.artifacts", href: "/artifacts", icon: FileText },
];

/** The user menu: the account's own pages. */
export const accountItems: NavItem[] = [
  { titleKey: "userMenu.usage", href: "/usage", icon: BarChart3 },
  { titleKey: "userMenu.pricing", href: "/pricing", icon: CreditCard },
];
