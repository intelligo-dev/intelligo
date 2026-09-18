/**
 * Shell top bar. It must render `AISidebarTrigger`: on mobile the sidebar
 * is an off-canvas sheet with no other way to open it. `children` adds
 * breadcrumbs or actions. A page portals its own bar into the empty
 * `shell-header-slot` (the chat's title and actions do) rather than
 * stacking a second header under this one.
 */

import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { AISidebarTrigger } from "@/components/ui/ai-sidebar";
import { Separator } from "@/components/ui/separator";

interface ShellHeaderProps {
  children?: ReactNode;
}

export async function ShellHeader({ children }: ShellHeaderProps) {
  const t = await getTranslations("app-shell");

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <AISidebarTrigger
        size="icon-sm"
        label={t("sidebar.toggle")}
        className="-ml-1"
      />
      <div className="mr-2 flex h-4 items-center">
        <Separator orientation="vertical" />
      </div>
      <div
        data-slot="shell-header-slot"
        className="flex min-w-0 flex-1 items-center"
      />
      {children}
    </header>
  );
}
