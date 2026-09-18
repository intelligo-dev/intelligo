"use client";

/**
 * App sidebar — nav as configuration. Pass `items` to override the
 * default nav entirely; the default only covers the routes the other
 * "registry" items in this catalogue install, so most consumers will
 * want to replace it once they add their own pages.
 *
 * Nav item titles are message keys, not literal strings:
 * `NavItem.titleKey` points into this item's `app-shell` namespace (e.g.
 * `"sidebar.nav.dashboard"` resolves `messages/en/app-shell.json`'s
 * `sidebar.nav.dashboard`), and this component resolves it via
 * `t(item.titleKey)`. A consumer overriding `items` supplies its own
 * keys backed by its own messages — never hardcoded titles here.
 *
 * The sidebar collapses to an icon rail on desktop (⌘/Ctrl-B, or the
 * header's trigger) and slides in as a sheet on mobile; the active row's
 * pill glides between items as the route changes.
 */

import * as React from "react";
import { useTranslations } from "use-intl";
import type { LucideIcon } from "lucide-react";

import { Link, usePathname } from "@showcase/i18n/navigation";
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
} from "@showcase/components/ui/ai-sidebar";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher, type Workspace } from "./workspace-switcher";
import { navItems as configuredNavItems } from "@showcase/lib/nav-config";

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
