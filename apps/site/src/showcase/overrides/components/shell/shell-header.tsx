/**
 * The app-shell item's `components/shell/shell-header.tsx` reads its copy
 * on the server; the preview renders the same bar on the client.
 */
import type { ReactNode } from "react";
import { useTranslations } from "use-intl";

import { AISidebarTrigger } from "@showcase/components/ui/ai-sidebar";
import { Separator } from "@showcase/components/ui/separator";

interface ShellHeaderProps {
  children?: ReactNode;
}

export function ShellHeader({ children }: ShellHeaderProps) {
  const t = useTranslations("app-shell");

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
