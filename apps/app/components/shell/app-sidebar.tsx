"use client";

/**
 * App sidebar — nav as configuration. Pass `items` to override the
 * default nav entirely; the default only covers the routes the other
 * "registry" items in this catalogue install, so most consumers will
 * want to replace it once they add their own pages.
 *
 * Nav item titles are message keys, not literal strings (ADR-0010):
 * `NavItem.titleKey` points into this item's `app-shell` namespace (e.g.
 * `"sidebar.nav.dashboard"` resolves `messages/en/app-shell.json`'s
 * `sidebar.nav.dashboard`), and this component resolves it via
 * `t(item.titleKey)`. A consumer overriding `items` supplies its own
 * keys backed by its own messages — never hardcoded titles here.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";

import { Link, usePathname } from "@/i18n/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher, type Workspace } from "./workspace-switcher";
import { navItems as configuredNavItems } from "@/lib/nav-config";

export interface NavItem {
  /**
   * Key into the `app-shell` namespace's `sidebar.nav` messages (e.g.
   * `"sidebar.nav.dashboard"`), resolved inside this component via
   * `t(item.titleKey)`. Nav config carries keys, not literal strings, so
   * a consumer overriding `items` still gets translated titles by
   * pointing at its own message keys instead of hardcoding copy here.
   */
  titleKey: string;
  href: string;
  icon?: LucideIcon;
}

interface AppSidebarProps {
  workspace: Workspace | null;
  workspaces: Workspace[];
  user: {
    name: string | null;
    email: string;
    image?: string | null;
  };
  items?: NavItem[];
  /** Rendered under the navigation — `shellConfig.sidebarContent`. */
  children?: React.ReactNode;
}

export function AppSidebar({
  workspace,
  workspaces,
  user,
  items = configuredNavItems,
  children,
}: AppSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("app-shell");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher
          currentWorkspace={workspace}
          workspaces={workspaces}
        />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname?.startsWith(`${item.href}/`);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={t(item.titleKey)}
                      render={<Link href={item.href} />}
                    >
                      {item.icon && <item.icon />}
                      <span>{t(item.titleKey)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {children}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu user={user} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
