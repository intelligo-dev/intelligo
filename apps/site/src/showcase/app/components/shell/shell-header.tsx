/**
 * Minimal shell top bar. Its one required job is exposing
 * `SidebarTrigger`: on mobile the sidebar renders as an off-canvas
 * sheet, and without a trigger somewhere there is no way to open it.
 *
 * Pass `children` to add page-specific breadcrumbs or actions without
 * editing this file — e.g. `<ShellHeader><Breadcrumb ... /></ShellHeader>`
 * from a page that wants one. A page that doesn't need a header slot
 * can ignore this entirely and render `<ShellHeader />` as-is.
 */

import type { ReactNode } from "react";

import { Separator } from "@showcase/components/ui/separator";
import { SidebarTrigger } from "@showcase/components/ui/sidebar";

interface ShellHeaderProps {
  children?: ReactNode;
}

export function ShellHeader({ children }: ShellHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      {children}
    </header>
  );
}
