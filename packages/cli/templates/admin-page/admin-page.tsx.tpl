/**
 * The operational console, mounted in your app.
 *
 * The screens ship from @intelligo-dev/admin so every deployment shows
 * the same operational truth — a fork could quietly stop showing you
 * unsettled executions. What is generated here is the mount: the route,
 * the authorization call and the page around the screens. The page is
 * yours: add your product's own sections after the package's, with the
 * data your own queries return.
 *
 * Access is a platform-admin row (`users.role`), seeded from
 * PLATFORM_ADMIN_EMAILS, not a workspace role: workspace `owner` is
 * per-tenant and every signup has one. A caller who is not one gets the
 * app's 404, because "Not authorized" — or a redirect — on a route says
 * the route exists.
 *
 * Each screen reads on its own: one that fails says so, and the rest of
 * the console still renders.
 */

import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  getIntegrationHealth,
  getPlatformOverview,
  listFailedJobs,
  listUnsettledExecutions,
  listWorkspaces,
  queryAuditEvents,
  requireAdmin,
} from "@intelligo-dev/admin";
import {
  IntegrationHealthView,
  OperationsView,
  PlatformOverviewView,
} from "@intelligo-dev/admin/views";

import { composeIntelligo } from "@/lib/intelligo";

export const dynamic = "force-dynamic";

/**
 * The package's screens are unstyled markup; these rules give their
 * headings, lists and tables the app's type and tokens.
 */
const SCREEN =
  "space-y-4 rounded-xl border border-border bg-card p-6 text-sm text-card-foreground " +
  "[&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_section]:space-y-2 " +
  "[&_ul]:list-disc [&_ul]:pl-5 [&_table]:w-full [&_th]:py-1 [&_th]:text-left " +
  "[&_th]:font-medium [&_th]:text-muted-foreground [&_td]:border-t [&_td]:border-border [&_td]:py-1";

/** A screen whose read failed, in place of the screen. */
function Unavailable({ what }: { what: string }) {
  return (
    <p className="text-muted-foreground">
      {what} could not be read — see the server log.
    </p>
  );
}

function screen<T>(
  result: PromiseSettledResult<T>,
  render: (value: T) => ReactNode,
  what: string
) {
  return (
    <div className={SCREEN}>
      {result.status === "fulfilled" ? (
        render(result.value)
      ) : (
        <Unavailable what={what} />
      )}
    </div>
  );
}

export default async function AdminPage() {
  composeIntelligo();

  try {
    await requireAdmin("admin.overview.viewed");
  } catch {
    notFound();
  }

  const [overview, integrations, operations] = await Promise.allSettled([
    Promise.all([
      getPlatformOverview(),
      listWorkspaces(20),
      listUnsettledExecutions(),
    ]),
    getIntegrationHealth(),
    Promise.all([listFailedJobs(20), queryAuditEvents({ limit: 20 })]),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 bg-background px-4 py-8 text-foreground">
      <h1 className="text-2xl font-semibold">Admin</h1>
      {screen(
        overview,
        ([platform, workspaces, unsettled]) => (
          <PlatformOverviewView
            overview={platform}
            workspaces={workspaces}
            unsettled={unsettled}
          />
        ),
        "The platform overview"
      )}
      {screen(
        integrations,
        (value) => (
          <IntegrationHealthView integrations={value} />
        ),
        "Integration health"
      )}
      {screen(
        operations,
        ([failedJobs, auditEvents]) => (
          <OperationsView failedJobs={failedJobs} auditEvents={auditEvents} />
        ),
        "Operations"
      )}
    </main>
  );
}
