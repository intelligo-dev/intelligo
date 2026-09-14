import type { ReactNode } from "react";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface ShellHeaderProps {
  children?: ReactNode;
}

export function ShellHeader({ children }: ShellHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
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
