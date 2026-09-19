import { getLocale } from "next-intl/server";
/**
 * The layout for every route under `(app)`. Checks, in order:
 *
 * 1. A session, checked here because middleware only reads the cookie.
 *    None → `/login`.
 * 2. Completed onboarding. Incomplete → `/onboarding`. The onboarding
 *    route is a sibling of `(app)`, so this cannot redirect into itself;
 *    if you nest onboarding under `(app)`, skip this check on that route.
 * 3. An active workspace. `ensureUserWorkspace` creates one if none
 *    exists; what a new workspace starts with is the handler
 *    `lib/intelligo.ts` sets with `setWorkspaceCreatedHandler`.
 */

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import {
  auth,
  ensureUserWorkspace,
  getAuthSession,
  getWorkspaceContextById,
} from "@intelligo-dev/auth";
import { db } from "@intelligo-dev/core/db";
import { users } from "@intelligo-dev/core/db/schema";

import { AppSidebar } from "@/components/shell/app-sidebar";
import { PageTransition } from "@/components/shell/page-transition";
import { ShellHeader } from "@/components/shell/shell-header";
import { TimeZoneCookie } from "@/components/shell/time-zone-cookie";
import { AISidebarInset, AISidebarProvider } from "@/components/ui/ai-sidebar";
import { redirect } from "@/i18n/navigation";
import { shellConfig } from "@/lib/shell-config";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getAuthSession();
  if (!session) {
    redirect({ href: "/login", locale: await getLocale() });
    return null;
  }

  const [userRecord] = await db
    .select({ onboardingCompleted: users.onboardingCompleted })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (userRecord && !userRecord.onboardingCompleted) {
    redirect({ href: "/onboarding", locale: await getLocale() });
    return null;
  }

  const hdrs = await headers();
  const activeWorkspaceId = await ensureUserWorkspace(session.user, hdrs);

  const [workspaces, workspaceContext] = await Promise.all([
    auth.api.listOrganizations({ headers: hdrs }).then((orgs) => orgs ?? []),
    getWorkspaceContextById(activeWorkspaceId),
  ]);

  if (!workspaceContext) {
    redirect({ href: "/login", locale: await getLocale() });
    return null;
  }

  const workspaceList = workspaces.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    logo: org.logo ?? null,
  }));

  // The shell is exactly one screen tall and the page region scrolls
  // inside it. A shell that grows with its page scrolls the window
  // instead, and a page that pins something to the bottom — the chat
  // composer — or scrolls its own region — the transcript — has no
  // height to work in.
  const SidebarContent = shellConfig.sidebarContent;
  return (
    <AISidebarProvider className="h-svh min-h-0 overflow-hidden">
      {/* Renders nothing; tells the server which day it is here. */}
      <TimeZoneCookie />
      <AppSidebar
        workspace={workspaceContext.workspace}
        workspaces={workspaceList}
        user={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
        }}
      >
        {SidebarContent ? <SidebarContent /> : null}
      </AppSidebar>
      <AISidebarInset className="min-h-0 overflow-hidden">
        <ShellHeader>
          {shellConfig.headerRight && (
            <div className="ml-auto flex items-center gap-2">
              <shellConfig.headerRight />
            </div>
          )}
        </ShellHeader>
        {shellConfig.bannerTop && <shellConfig.bannerTop />}
        <PageTransition className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </PageTransition>
      </AISidebarInset>
    </AISidebarProvider>
  );
}
