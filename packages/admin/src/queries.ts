import "server-only";

/**
 * Admin read models.
 *
 * Cross-tenant by design — that is what makes them admin queries and
 * why every caller must pass through `requireAdmin` first. They read
 * through the owning packages' own APIs where those exist
 * (`@intelligo-dev/executions`, `@intelligo-dev/audit`) so the console does
 * not become a second, drifting definition of what an execution is.
 */

import { db } from "@intelligo-dev/core/db";
import { organization, users } from "@intelligo-dev/core/db/schema";
import { executions } from "@intelligo-dev/executions";
import { PLATFORM_ADMIN_ROLE } from "@intelligo-dev/auth";
import { queryAuditEvents } from "@intelligo-dev/audit";
import { listFailedJobs } from "@intelligo-dev/jobs";
import { and, desc, eq, gte, sql } from "drizzle-orm";

export type PlatformOverview = {
  workspaces: number;
  users: number;
  executions24h: number;
  failed24h: number;
  refused24h: number;
  chargedMnt24h: number;
};

/**
 * Platform-wide counters for the last 24 hours.
 *
 * Refusals are surfaced next to failures on purpose: a spike in
 * refusals is a pricing or provisioning problem that looks like
 * nothing in an error dashboard.
 */
export async function getPlatformOverview(): Promise<PlatformOverview> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [[workspaceCount], [userCount], statusRows] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(organization),
    db.select({ n: sql<number>`count(*)` }).from(users),
    db
      .select({
        status: executions.status,
        n: sql<number>`count(*)`,
        chargedMnt: sql<number>`coalesce(sum(${executions.chargedMnt}), 0)`,
      })
      .from(executions)
      .where(gte(executions.startedAt, since))
      .groupBy(executions.status),
  ]);

  const byStatus = new Map(
    statusRows.map((r) => [
      r.status,
      { n: Number(r.n), chargedMnt: Number(r.chargedMnt) },
    ])
  );
  const total = statusRows.reduce((sum, r) => sum + Number(r.n), 0);
  const charged = statusRows.reduce((sum, r) => sum + Number(r.chargedMnt), 0);

  return {
    workspaces: Number(workspaceCount?.n ?? 0),
    users: Number(userCount?.n ?? 0),
    executions24h: total,
    failed24h: byStatus.get("failed")?.n ?? 0,
    refused24h: byStatus.get("refused")?.n ?? 0,
    chargedMnt24h: charged,
  };
}

export type WorkspaceRow = {
  id: string;
  name: string;
  slug: string | null;
  createdAt: Date;
};

export async function listWorkspaces(limit = 50): Promise<WorkspaceRow[]> {
  return db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
    })
    .from(organization)
    .orderBy(desc(organization.createdAt))
    .limit(Math.min(limit, 200));
}

export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  /** Platform role, if any — admins cannot be impersonated. */
  role: string | null;
};

/**
 * Recently created users, for support workflows.
 *
 * Platform admins are excluded: Better-Auth refuses to impersonate one
 * anyway (`allowImpersonatingAdmins: false`), and offering the choice
 * only produces a confusing failure.
 */
export async function listUsers(limit = 50): Promise<UserRow[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(Math.min(limit, 200));

  return rows.filter((u) => !(u.role ?? "").includes(PLATFORM_ADMIN_ROLE));
}

/**
 * Executions stuck in a non-terminal state — the operational signal
 * that usage was consumed and never charged. Cross-tenant, because
 * the question "is settlement broken right now" is platform-wide.
 */
export async function listUnsettledExecutions(olderThanMs = 600_000) {
  const cutoff = new Date(Date.now() - olderThanMs);
  return db
    .select()
    .from(executions)
    .where(
      and(
        sql`${executions.status} IN ('running', 'settling')`,
        sql`${executions.startedAt} < ${cutoff}`
      )
    )
    .orderBy(desc(executions.startedAt))
    .limit(100);
}

/** Recent executions for one workspace — the support-ticket view. */
export async function listWorkspaceExecutions(workspaceId: string, limit = 50) {
  return db
    .select()
    .from(executions)
    .where(eq(executions.workspaceId, workspaceId))
    .orderBy(desc(executions.startedAt))
    .limit(Math.min(limit, 200));
}

export { queryAuditEvents, listFailedJobs };
