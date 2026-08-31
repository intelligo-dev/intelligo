/**
 * The admin console mounted by a consumer application.
 *
 * The point of this page existing in the reference app: proving the
 * same `@intelligo-dev/admin` package serves any product, and that
 * mounting it takes a route plus an authorization call rather than a
 * fork (ADR-0002). A product mounts the same package the same way.
 *
 * It lives inside `(app)` so it inherits the shell — an operator is a
 * signed-in user, not a visitor to a separate application — and a
 * caller who is not a platform admin is redirected to the dashboard
 * rather than told the route exists. "Not authorized" on a page that
 * renders is itself a disclosure.
 *
 * Platform admin is a row, not an env var (`users.role`); see
 * `PLATFORM_ADMIN_EMAILS` for how the first one is seeded.
 */

import { redirect } from "next/navigation";

import {
  getIntegrationHealth,
  getPlatformOverview,
  listFailedJobs,
  listUnsettledExecutions,
  listUsers,
  listWorkspaces,
  queryAuditEvents,
  requireAdmin,
} from "@intelligo-dev/admin";
import {
  ImpersonationPanel,
  IntegrationHealthView,
  OperationsView,
  PlatformOverviewView,
} from "@intelligo-dev/admin/views";

import { impersonateUserAction } from "@/actions/impersonation";
import { composeIntelligo } from "@/lib/intelligo";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  composeIntelligo();

  try {
    await requireAdmin("admin.overview.viewed");
  } catch {
    redirect("/dashboard");
  }

  const [
    overview,
    workspaces,
    unsettled,
    failedJobs,
    auditEvents,
    integrations,
    users,
  ] = await Promise.all([
    getPlatformOverview(),
    listWorkspaces(20),
    listUnsettledExecutions(),
    listFailedJobs(20),
    queryAuditEvents({ limit: 20 }),
    getIntegrationHealth(),
    listUsers(50),
  ]);

  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <PlatformOverviewView
        overview={overview}
        workspaces={workspaces}
        unsettled={unsettled}
      />
      <IntegrationHealthView integrations={integrations} />
      <OperationsView failedJobs={failedJobs} auditEvents={auditEvents} />
      <ImpersonationPanel
        users={users}
        action={async (formData: FormData) => {
          "use server";
          await impersonateUserAction({}, formData);
        }}
      />
    </main>
  );
}
