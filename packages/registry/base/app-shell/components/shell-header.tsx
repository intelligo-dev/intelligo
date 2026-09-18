/**
 * Minimal shell top bar. Its one required job is exposing
 * `AISidebarTrigger`: on mobile the sidebar renders as an off-canvas
 * sheet, and without a trigger somewhere there is no way to open it.
 *
 * Pass `children` to add page-specific breadcrumbs or actions without
 * editing this file — e.g. `<ShellHeader><Breadcrumb ... /></ShellHeader>`
 * from a page that wants one. A page that doesn't need a header slot
 * can ignore this entirely and render `<ShellHeader />` as-is.
 *
 * The empty `shell-header-slot` is where a page puts its own bar — the
 * chat's conversation title and actions portal into it — so a page
 * does not stack a second header under this one.
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
