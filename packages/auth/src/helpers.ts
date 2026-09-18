/**
 * Session and workspace guards for server components, Server Actions and
 * route handlers. Headers come from `@intelligo-dev/core/request-context`.
 */

import { getRequestHeaders } from "@intelligo-dev/core/request-context";
import { auth } from "./server";
import { createLogger } from "@intelligo-dev/core/logger";
import { db } from "@intelligo-dev/core/db";
import { users } from "@intelligo-dev/core/db/schema";
import { eq } from "drizzle-orm";
import type { Session, User } from "better-auth/types";
import { PLATFORM_ADMIN_ROLE } from "./roles";

/** Better-Auth workspace roles, as accepted by `requireRole()`. */
export type WorkspaceRole = "owner" | "admin" | "member";

const log = createLogger("Auth");

/**
 * The current session and user, or null when unauthenticated.
 */
export async function getAuthSession(): Promise<{
  session: Session;
  user: User;
} | null> {
  const session = await auth.api.getSession({
    headers: await getRequestHeaders(),
  });

  if (!session?.user) {
    return null;
  }

  return {
    session: session.session,
    user: session.user,
  };
}

/**
 * The current session and user.
 *
 * @throws Error("Unauthorized") when there is no valid session.
 */
export async function requireAuth(): Promise<{
  session: Session;
  user: User;
}> {
  const result = await getAuthSession();

  if (!result) {
    throw new Error("Unauthorized");
  }

  return result;
}

/**
 * Workspace context for a given organization id, e.g. just after creating
 * or activating one. Null when unauthenticated or not a member.
 */
export async function getWorkspaceContextById(organizationId: string): Promise<{
  session: Session;
  user: User;
  workspace: { id: string; name: string; slug: string; logo?: string | null };
  membership: { id: string; role: WorkspaceRole };
} | null> {
  const authResult = await getAuthSession();
  if (!authResult) {
    log.debug("getWorkspaceContextById: no auth session");
    return null;
  }

  log.debug("getWorkspaceContextById: fetching org");

  const org = await auth.api.getFullOrganization({
    headers: await getRequestHeaders(),
    query: { organizationId },
  });

  if (!org) {
    log.debug("getWorkspaceContextById: org not found");
    return null;
  }

  const membership = org.members?.find(
    (m: any) => m.userId === authResult.user.id
  );

  if (!membership) {
    log.debug("getWorkspaceContextById: user not a member");
    return null;
  }

  return {
    session: authResult.session,
    user: authResult.user,
    workspace: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logo: org.logo,
    },
    membership: {
      id: membership.id,
      role: membership.role,
    },
  };
}

/**
 * Workspace context from the session's active organization, falling back to
 * the user's first workspace. Null when the user has none.
 */
export async function getWorkspaceContext(): Promise<{
  session: Session;
  user: User;
  workspace: { id: string; name: string; slug: string; logo?: string | null };
  membership: { id: string; role: WorkspaceRole };
} | null> {
  const authResult = await getAuthSession();
  if (!authResult) {
    log.debug("getWorkspaceContext: no auth session");
    return null;
  }

  log.debug("getWorkspaceContext: session found");

  // Better-Auth throws FORBIDDEN when the active organization no longer
  // admits this user (removed member) and clears the pointer; treat that
  // as "no active workspace" so the fallback below runs.
  let activeOrg = await auth.api
    .getFullOrganization({ headers: await getRequestHeaders() })
    .catch((error: unknown) => {
      log.debug("getWorkspaceContext: active org not readable", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

  log.debug("getWorkspaceContext: active org", { hasOrg: !!activeOrg });

  if (!activeOrg) {
    log.debug("getWorkspaceContext: no active org, checking workspaces");
    const orgs: any = await auth.api.listOrganizations({
      headers: await getRequestHeaders(),
    });

    if (orgs && orgs.length > 0) {
      log.debug("getWorkspaceContext: found workspaces", {
        count: String(orgs.length),
      });
      activeOrg = await auth.api.getFullOrganization({
        headers: await getRequestHeaders(),
        query: { organizationId: orgs[0].id },
      });
    }
  }

  if (!activeOrg) {
    log.debug("getWorkspaceContext: no workspaces found");
    return null;
  }

  const activeMember = activeOrg.members.find(
    (m: any) => m.userId === authResult.user.id
  );

  log.debug("getWorkspaceContext: membership check", {
    hasMembership: !!activeMember,
  });

  if (!activeMember) {
    log.debug("getWorkspaceContext: user not a member of active org");
    return null;
  }

  return {
    session: authResult.session,
    user: authResult.user,
    workspace: {
      id: activeOrg.id,
      name: activeOrg.name,
      slug: activeOrg.slug,
      logo: activeOrg.logo,
    },
    membership: {
      id: activeMember.id,
      role: activeMember.role,
    },
  };
}

/**
 * Workspace context for workspace-scoped operations.
 *
 * @throws Error("Unauthorized") when unauthenticated, Error("No active
 *   workspace") when the user has none.
 */
export async function requireWorkspace(): Promise<{
  session: Session;
  user: User;
  workspace: { id: string; name: string; slug: string; logo?: string | null };
  membership: { id: string; role: WorkspaceRole };
}> {
  const context = await getWorkspaceContext();
  if (!context) {
    throw new Error("No active workspace");
  }
  return context;
}

/**
 * Workspace context when the member holds one of `allowedRoles`, e.g.
 * `requireRole(["owner", "admin"])`.
 *
 * @throws Error("Insufficient permissions") when the member lacks the role.
 */
export async function requireRole(allowedRoles: WorkspaceRole[]): Promise<{
  session: Session;
  user: User;
  workspace: { id: string; name: string; slug: string; logo?: string | null };
  membership: { id: string; role: WorkspaceRole };
}> {
  const context = await requireWorkspace();
  // Better-Auth stores roles as a comma-separated string, so a member
  // may hold more than one; any of them may satisfy the check.
  const held = String(context.membership.role)
    .split(",")
    .map((r) => r.trim()) as WorkspaceRole[];
  if (!held.some((r) => allowedRoles.includes(r))) {
    throw new Error("Insufficient permissions");
  }
  return context;
}

/**
 * Require a PLATFORM admin, distinct from workspace roles: workspace
 * `owner` is per-tenant, so platform surfaces must never be gated on it.
 *
 * The authority is `users.role`. PLATFORM_ADMIN_EMAILS is the bootstrap:
 * an allowlisted user is promoted into the column on first use, so every
 * later check, Better-Auth's admin plugin included, reads the same row.
 * Closed by default: no allowlist and no role means no admin.
 *
 * @throws Error("Insufficient permissions") when the user is not a
 *   platform admin.
 */
export async function requirePlatformAdmin(): Promise<{
  session: Session;
  user: User;
}> {
  const { session, user } = await requireAuth();

  const allowlist = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const email = user.email?.toLowerCase();
  const allowlisted = !!email && allowlist.includes(email);
  const roles = ((user as { role?: string | null }).role ?? "")
    .split(",")
    .map((r) => r.trim());
  const hasRole = roles.includes(PLATFORM_ADMIN_ROLE);

  if (!allowlisted && !hasRole) {
    throw new Error("Insufficient permissions");
  }

  // Promote on first use so the row, not the environment, is what
  // every other check reads. A failure here must not lock an admin out
  // mid-incident — they are already authorized by the allowlist.
  if (allowlisted && !hasRole) {
    const next = [...roles.filter(Boolean), PLATFORM_ADMIN_ROLE].join(",");
    try {
      await db.update(users).set({ role: next }).where(eq(users.id, user.id));
    } catch (error) {
      log.error("Failed to promote allowlisted platform admin", {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { session, user };
}
