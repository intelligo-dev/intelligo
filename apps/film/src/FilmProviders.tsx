import type { ReactNode } from "react";
import { IntlProvider } from "use-intl";
import { PathnameContext } from "@ui/i18n/navigation";
import type { Workspace } from "@ui/components/shell/workspace-switcher";
import appShellMessages from "@ui/messages/en/app-shell.json";
import dashboardMessages from "@ui/messages/en/dashboard.json";
import chatMessages from "@ui/messages/en/chat.json";

/**
 * Everything the real app-shell/dashboard/chat surface (src/ui — see
 * scripts/sync-ui.mjs) needs mounted above it: all three namespaces'
 * translations and a pathname for the sidebar's active-item state. One
 * fixture "acme" workspace and one "Maya" user, matching the names the
 * original hand-drawn sidebar/topbar already used.
 */
export const WORKSPACE: Workspace = { id: "ws_acme", name: "Acme Inc", slug: "acme" };
export const WORKSPACES: Workspace[] = [WORKSPACE];
export const USER = { name: "Maya Chen", email: "maya@acme.com", image: null };

export function FilmProviders({ children }: { children: ReactNode }) {
  return (
    <IntlProvider
      locale="en"
      timeZone="UTC"
      now={new Date("2026-08-29T09:00:00Z")}
      messages={{
        "app-shell": appShellMessages,
        dashboard: dashboardMessages,
        chat: chatMessages,
      }}
      onError={() => {}}
      getMessageFallback={({ key }) => key.split(".").pop() ?? key}
    >
      <PathnameContext.Provider value="/dashboard">
        {children}
      </PathnameContext.Provider>
    </IntlProvider>
  );
}
