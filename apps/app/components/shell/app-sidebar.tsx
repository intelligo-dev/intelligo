"use client";

/**
 * The shell's sidebar. `items` replaces the nav from `@/lib/nav-config`
 * entirely. It collapses to an icon rail on desktop (⌘/Ctrl-B, or the
 * header's trigger) and slides in as a sheet on mobile.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";

import { Link, usePathname } from "@/i18n/navigation";
import {
  AISidebar,
  AISidebarContent,
  AISidebarFooter,
  AISidebarHeader,
  AISidebarItem,
  AISidebarMenu,
  AISidebarMenuItem,
  AISidebarRail,
  AISidebarSection,
} from "@/components/ui/ai-sidebar";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher, type Workspace } from "./workspace-switcher";
import { navItems as configuredNavItems } from "@/lib/nav-config";

export interface NavItem {
  /**
   * A message key in the `app-shell` namespace (e.g.
   * `"sidebar.nav.dashboard"`), not a literal title.
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
    <AISidebar
      collapsible="icon"
      label={t("sidebar.label")}
      closeLabel={t("sidebar.close")}
    >
      <AISidebarHeader>
        <WorkspaceSwitcher
          currentWorkspace={workspace}
          workspaces={workspaces}
        />
      </AISidebarHeader>

      <AISidebarContent>
        <AISidebarSection>
          <AISidebarMenu>
            {items.map((item) => {
              const isActive =
                pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <AISidebarMenuItem key={item.href}>
                  <AISidebarItem
                    isActive={isActive}
                    icon={item.icon ? <item.icon /> : undefined}
                    tooltip={t(item.titleKey)}
                    render={<Link href={item.href} />}
                  >
                    {t(item.titleKey)}
                  </AISidebarItem>
                </AISidebarMenuItem>
              );
            })}
          </AISidebarMenu>
        </AISidebarSection>
        {children}
      </AISidebarContent>

      <AISidebarFooter>
        <UserMenu user={user} />
      </AISidebarFooter>
      <AISidebarRail label={t("sidebar.toggle")} />
    </AISidebar>
  );
}
