"use client";

/**
 * Avatar dropdown: account pages (`accountItems` from `@/lib/nav-config`),
 * settings, a theme submenu and sign out.
 *
 * The theme submenu only switches themes once a `ThemeProvider` is
 * mounted; without one `useTheme()` is a no-op. The `mounted` check
 * avoids a hydration mismatch between the server render (no theme) and
 * the client's resolved theme.
 */

import * as React from "react";
import { useTranslations } from "use-intl";
import {
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  User,
} from "lucide-react";
import { useTheme } from "next-themes";

import { authClient } from "@showcase/shims/auth-client";

import { Avatar, AvatarFallback, AvatarImage } from "@showcase/components/ui/avatar";
import { Link, useRouter } from "@showcase/i18n/navigation";
import { accountItems } from "@showcase/lib/nav-config";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@showcase/components/ui/dropdown-menu";
import { useAISidebar, useAISidebarPanel } from "@showcase/components/ui/ai-sidebar";
import { cn } from "@showcase/lib/utils";

const TRIGGER =
  "flex w-full min-w-0 items-center gap-2 rounded-xl p-1.5 text-left text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:opacity-50 data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground";

interface UserMenuProps {
  user: {
    name: string | null;
    email: string;
    image?: string | null;
  };
}

export function UserMenu({ user }: UserMenuProps) {
  const { isMobile } = useAISidebar();
  const { collapsed } = useAISidebarPanel();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const router = useRouter();
  const t = useTranslations("app-shell");

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const initials = user.name
    ? user.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user.email[0]?.toUpperCase();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(TRIGGER, collapsed && "justify-center")}
          />
        }
      >
        <Avatar className="size-8 rounded-lg">
          {user.image && <AvatarImage src={user.image} alt={user.name ?? ""} />}
          <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
        </Avatar>
        {collapsed ? null : (
          <>
            <div className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate text-sm font-medium">
                {user.name || user.email.split("@")[0]}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 opacity-50" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--anchor-width) min-w-56"
        side={isMobile ? "bottom" : collapsed ? "right" : "top"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Avatar className="size-8 rounded-lg">
                {user.image && (
                  <AvatarImage src={user.image} alt={user.name ?? ""} />
                )}
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 leading-tight">
                <span className="truncate text-sm font-medium">
                  {user.name || user.email.split("@")[0]}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/settings" />}>
            <User />
            {t("userMenu.profile")}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings/workspace" />}>
            <Settings />
            {t("userMenu.workspaceSettings")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        {accountItems.length > 0 ? (
          <>
            <DropdownMenuGroup>
              {accountItems.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem
                    key={item.href}
                    render={<Link href={item.href} />}
                  >
                    {Icon ? <Icon /> : null}
                    {t(item.titleKey)}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {mounted && theme === "dark" ? <Moon /> : <Sun />}
            {t("userMenu.theme")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun />
              {t("userMenu.themeLight")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon />
              {t("userMenu.themeDark")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Monitor />
              {t("userMenu.themeSystem")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="text-destructive focus:text-destructive"
        >
          <LogOut />
          {t("userMenu.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
