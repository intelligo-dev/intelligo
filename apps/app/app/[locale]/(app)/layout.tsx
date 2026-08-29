import { getLocale } from "next-intl/server";
/**
 * Authenticated app shell — the layout for every route under `(app)`.
 *
 * Checks, in order:
 *
 * 1. Session required. `getAuthSession()` is a belt-and-suspenders check
 *    (defense in depth alongside middleware, which only reads the
 *    session cookie and redirects — see the "optimistic middleware,
 *    authoritative server" convention). No session → `/login`.
 *
 * 2. Onboarding required. Reads `users.onboardingCompleted` directly via
 *    `@intelligo/core/db` — no dedicated `@intelligo/auth` helper exists
 *    for this yet, and a single-row, two-column lookup is cheap enough
 *    to keep inline here rather than invent a package API for one call
 *    site. Incomplete → `/onboarding`.
 *
 *    Acme's original version of this layout read an `x-pathname`
 *    header (set by custom middleware) to skip this check while
 *    already on the onboarding route, to avoid a redirect loop. That
 *    dependency is dropped here on purpose: the `onboarding` registry
 *    item installs at `app/onboarding/*`, a sibling of `(app)`, not a
 *    route inside it — so this layout never wraps the onboarding flow
 *    and can never redirect into itself. If your product nests
 *    onboarding under `(app)` instead, reintroduce a route check (a
 *    pathname header, or simpler, a route-group check) before this
 *    redirect fires.
 *
 * 3. Active workspace required. `ensureUserWorkspace` (`@intelligo/auth`)
 *    creates one if none exists. First-workspace provisioning (trial
 *    credits, referral bonuses, anything else your product wants to do
 *    exactly once) is bound through `@/lib/workspace-bootstrap` — never
 *    imported directly here (ADR-0005: explicit composition-root
 *    wiring, not an import side effect; it also keeps this file, and
 *    `@intelligo/auth`, free of a hard dependency on billing).
 */

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import {
  auth,
  ensureUserWorkspace,
  getAuthSession,
  getWorkspaceContextById,
} from "@intelligo/auth";
import { db } from "@intelligo/core/db";
import { users } from "@intelligo/core/db/schema";

import { AppSidebar } from "@/components/shell/app-sidebar";
import { ShellHeader } from "@/components/shell/shell-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { redirect } from "@/i18n/navigation";
import { shellConfig } from "@/lib/shell-config";
import { onWorkspaceCreated } from "@/lib/workspace-bootstrap";

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
  const activeWorkspaceId = await ensureUserWorkspace(session.user, hdrs, {
    onWorkspaceCreated,
  });

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

  return (
    <SidebarProvider>
      <AppSidebar
        workspace={workspaceContext.workspace}
        workspaces={workspaceList}
        user={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
        }}
      />
      <SidebarInset>
        <ShellHeader>
          {shellConfig.headerRight && (
            <div className="ml-auto flex items-center gap-2">
              <shellConfig.headerRight />
            </div>
          )}
        </ShellHeader>
        {shellConfig.bannerTop && <shellConfig.bannerTop />}
        <main className="flex-1 overflow-hidden">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
