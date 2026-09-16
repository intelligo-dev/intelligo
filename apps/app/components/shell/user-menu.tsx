"use client";

/**
 * User menu — avatar dropdown with profile/settings links, an optional
 * theme toggle, and sign out.
 *
 * The theme submenu is guarded, not required: `next-themes`'s
 * `useTheme()` degrades to a no-op setter when no `ThemeProvider` is
 * mounted, so this menu renders fine either way — wrap the root layout
 * in a `ThemeProvider` to make it actually switch themes. The `mounted`
 * check avoids a hydration mismatch between the server render (no theme
 * yet) and the client's resolved theme.
 *
 * The account pages — usage, pricing, whatever a product adds — come
 * from `accountItems` in `@/lib/nav-config`, the same consumer-owned
 * file the sidebar reads. They live here rather than in the sidebar
 * because they are things you go and look at, not things you work in,
 * and a row for each one pushed the product's own surfaces down the
 * list.
 *
 * No notifications entry: the header's bell already opens that
 * surface, and the `notifications` item ships it.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
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

import { authClient } from "@intelligo-dev/auth/client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link, useRouter } from "@/i18n/navigation";
import { accountItems } from "@/lib/nav-config";
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
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";

interface UserMenuProps {
  user: {
    name: string | null;
    email: string;
    image?: string | null;
  };
}

export function UserMenu({ user }: UserMenuProps) {
  const { isMobile } = useSidebar();
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
          <SidebarMenuButton
            size="lg"
            className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
          />
        }
      >
        <Avatar className="size-8 rounded-lg">
          {user.image && <AvatarImage src={user.image} alt={user.name ?? ""} />}
          <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
        </Avatar>
        <div className="grid flex-1 text-left leading-tight">
          <span className="truncate text-sm font-medium">
            {user.name || user.email.split("@")[0]}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {user.email}
          </span>
        </div>
        <ChevronsUpDown className="ml-auto size-4 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--anchor-width) min-w-56"
        side={isMobile ? "bottom" : "top"}
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
