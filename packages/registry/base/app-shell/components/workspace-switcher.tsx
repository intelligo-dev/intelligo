"use client";

/**
 * Workspace switcher — lists the caller's workspaces (server-fetched by
 * the layout, passed down as props) and activates one via Better-Auth's
 * organization plugin.
 *
 * No create-workspace dialog: creating a workspace needs a name/slug
 * form, a pending state, and error handling of its own — enough surface
 * that it deserves its own component once a product wants self-serve
 * multi-workspace creation, not something to bundle in sight-unseen.
 * Wire one up against `authClient.organization.create` when you need it.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown } from "lucide-react";

import { authClient } from "@intelligo-dev/auth/client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { useRouter } from "@/i18n/navigation";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
}

interface WorkspaceSwitcherProps {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
}

export function WorkspaceSwitcher({
  currentWorkspace,
  workspaces,
}: WorkspaceSwitcherProps) {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const [isSwitching, setIsSwitching] = React.useState(false);
  const t = useTranslations("app-shell");

  if (!currentWorkspace) return null;

  async function handleSwitch(workspaceId: string) {
    if (!currentWorkspace || workspaceId === currentWorkspace.id) return;
    setIsSwitching(true);
    try {
      await authClient.organization.setActive({ organizationId: workspaceId });
      router.refresh();
    } catch (error) {
      console.error("Failed to switch workspace:", error);
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            size="lg"
            disabled={isSwitching}
            className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
          />
        }
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
          {currentWorkspace.name[0]?.toUpperCase()}
        </div>
        <div className="grid flex-1 text-left leading-tight">
          <span className="truncate text-sm font-medium">
            {currentWorkspace.name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {currentWorkspace.slug}
          </span>
        </div>
        {workspaces.length > 1 && (
          <ChevronsUpDown className="ml-auto size-4 opacity-50" />
        )}
      </DropdownMenuTrigger>
      {workspaces.length > 1 && (
        <DropdownMenuContent
          className="w-(--anchor-width) min-w-56"
          align="start"
          side={isMobile ? "bottom" : "right"}
          sideOffset={4}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {t("workspaceSwitcher.workspacesLabel")}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {workspaces.map((ws) => (
              <DropdownMenuItem
                key={ws.id}
                onClick={() => handleSwitch(ws.id)}
                disabled={isSwitching}
                className="gap-2"
              >
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                  {ws.name[0]?.toUpperCase()}
                </div>
                <div className="grid flex-1 leading-tight">
                  <span className="truncate text-sm">{ws.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {ws.slug}
                  </span>
                </div>
                {ws.id === currentWorkspace.id && (
                  <Check className="ml-auto size-4" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
