/**
 * The Intelligo operational console, mounted in your app.
 *
 * The screen itself ships from @intelligo/admin so every deployment
 * shows the same operational truth — a fork could quietly stop showing
 * you unsettled executions. What is generated here is only the mount:
 * the route, the authorization call, and your own page chrome
 * (ADR-0002).
 *
 * Access is gated on PLATFORM_ADMIN_EMAILS, not on a workspace role.
 * Workspace `owner` is per-tenant and every signup has one.
 */

import {
  getPlatformOverview,
  listUnsettledExecutions,
  listWorkspaces,
  requireAdmin,
} from "@intelligo/admin";
import { PlatformOverviewView } from "@intelligo/admin/views";

import { composeIntelligo } from "@/lib/intelligo";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  composeIntelligo();

  try {
    await requireAdmin("admin.overview.viewed");
  } catch {
    return (
      <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
        <h1>Admin</h1>
        <p>Not authorized.</p>
      </main>
    );
  }

  const [overview, workspaces, unsettled] = await Promise.all([
    getPlatformOverview(),
    listWorkspaces(20),
    listUnsettledExecutions(),
  ]);

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>Admin</h1>
      <PlatformOverviewView
        overview={overview}
        workspaces={workspaces}
        unsettled={unsettled}
      />
    </main>
  );
}
