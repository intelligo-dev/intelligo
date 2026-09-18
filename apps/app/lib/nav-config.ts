/**
 * Shell navigation. Imported directly by client components, never passed
 * from a Server Component: icons are components and cannot cross the
 * server/client boundary.
 *
 * `navItems` fills the sidebar; `accountItems` fills the user menu.
 * `titleKey`s are keys in `messages/<locale>/app-shell.json`. Remove the
 * entries whose routes you did not install; they would 404.
 */

import {
  BarChart3,
  CreditCard,
  FileText,
  LayoutDashboard,
  MessageSquare,
} from "lucide-react";

import type { NavItem } from "@/components/shell/app-sidebar";

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
