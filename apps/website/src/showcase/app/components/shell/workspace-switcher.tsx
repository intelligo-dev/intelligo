"use client";

/**
 * Lists the caller's workspaces (fetched by the layout) and activates one
 * through Better-Auth's organization plugin. It has no create-workspace
 * action; build one on `authClient.organization.create` if you need it.
 */

import * as React from "react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import { Check, ChevronsUpDown } from "lucide-react";

import { authClient } from "@showcase/shims/auth-client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@showcase/components/ui/dropdown-menu";
import { useAISidebar, useAISidebarPanel } from "@showcase/components/ui/ai-sidebar";
import { cn } from "@showcase/lib/utils";
import { useRouter } from "@showcase/i18n/navigation";

const TRIGGER =
  "flex w-full min-w-0 items-center gap-2 rounded-xl p-1.5 text-left text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:opacity-50 data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground";

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
  const { isMobile } = useAISidebar();
  const { collapsed } = useAISidebarPanel();
  const router = useRouter();
  const [isSwitching, setIsSwitching] = React.useState(false);
  const t = useTranslations("app-shell");

  if (!currentWorkspace) return null;

  async function handleSwitch(workspaceId: string) {
    if (!currentWorkspace || workspaceId === currentWorkspace.id) return;
    setIsSwitching(true);
    try {
      // Better-Auth answers a refusal as `{ error }` rather than throwing.
      const { error } = await authClient.organization.setActive({
        organizationId: workspaceId,
      });
      if (error) {
        toast.error(t("workspaceSwitcher.switchFailed"));
        return;
      }
      router.refresh();
    } catch {
      toast.error(t("workspaceSwitcher.switchFailed"));
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            disabled={isSwitching}
            className={cn(TRIGGER, collapsed && "justify-center")}
          />
        }
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
          {currentWorkspace.name[0]?.toUpperCase()}
        </div>
        {collapsed ? null : (
          <>
            <div className="grid min-w-0 flex-1 text-left leading-tight">
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
          </>
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
