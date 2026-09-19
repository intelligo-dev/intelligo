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
import { AuthGuardError } from "./guard-error";
import { PLATFORM_ADMIN_ROLE, platformAdminStanding } from "./roles";

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
 * @throws AuthGuardError `unauthenticated` ("Unauthorized") when there is
 *   no valid session.
 */
export async function requireAuth(): Promise<{
  session: Session;
  user: User;
}> {
  const result = await getAuthSession();

  if (!result) {
    throw new AuthGuardError("unauthenticated");
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

type WorkspaceContext = {
  session: Session;
  user: User;
  workspace: { id: string; name: string; slug: string; logo?: string | null };
  membership: { id: string; role: WorkspaceRole };
};

/**
 * The workspace a session acts in: its active organization, read by explicit
 * id, falling back to the user's first workspace. Null when the user has none.
 */
async function resolveWorkspaceContext(authResult: {
  session: Session;
  user: User;
}): Promise<WorkspaceContext | null> {
  const activeOrganizationId = (
    authResult.session as { activeOrganizationId?: string | null }
  ).activeOrganizationId;

  // Better-Auth throws FORBIDDEN when the active organization no longer
  // admits this user (removed member); treat that as "no active workspace"
  // so the fallback below runs.
  let activeOrg = activeOrganizationId
    ? await auth.api
        .getFullOrganization({
          headers: await getRequestHeaders(),
          query: { organizationId: activeOrganizationId },
        })
        .catch((error: unknown) => {
          log.debug("getWorkspaceContext: active org not readable", {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        })
    : null;

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
 * Workspace context from the session's active organization, falling back to
 * the user's first workspace. Null when unauthenticated or when the user has
 * none.
 */
export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  const authResult = await getAuthSession();
  if (!authResult) {
    log.debug("getWorkspaceContext: no auth session");
    return null;
  }

  return resolveWorkspaceContext(authResult);
}

/**
 * Workspace context for workspace-scoped operations.
 *
 * @throws AuthGuardError `unauthenticated` ("Unauthorized") when there is
 *   no valid session, `no_workspace` ("No active workspace") when the user
 *   has none.
 */
export async function requireWorkspace(): Promise<WorkspaceContext> {
  const context = await resolveWorkspaceContext(await requireAuth());
  if (!context) {
    throw new AuthGuardError("no_workspace");
  }
  return context;
}

/**
 * Workspace context when the member holds one of `allowedRoles`, e.g.
 * `requireRole(["owner", "admin"])`.
 *
 * @throws AuthGuardError `forbidden` ("Insufficient permissions") when the
 *   member lacks the role, and whatever `requireWorkspace` throws.
 */
export async function requireRole(
  allowedRoles: WorkspaceRole[]
): Promise<WorkspaceContext> {
  const context = await requireWorkspace();
  // Better-Auth stores roles as a comma-separated string, so a member
  // may hold more than one; any of them may satisfy the check.
  const held = String(context.membership.role)
    .split(",")
    .map((r) => r.trim()) as WorkspaceRole[];
  if (!held.some((r) => allowedRoles.includes(r))) {
    throw new AuthGuardError("forbidden");
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
 * @throws AuthGuardError `unauthenticated` when there is no session,
 *   `forbidden` ("Insufficient permissions") when the user is not a
 *   platform admin.
 */
export async function requirePlatformAdmin(): Promise<{
  session: Session;
  user: User;
}> {
  const { session, user } = await requireAuth();

  const { allowlisted, hasRole, roles } = platformAdminStanding(
    user as { email?: string | null; role?: string | null }
  );

  if (!allowlisted && !hasRole) {
    throw new AuthGuardError("forbidden");
  }

  // Promote on first use so the row, not the environment, is what
  // every other check reads. A failure here must not lock an admin out
  // mid-incident — they are already authorized by the allowlist.
  if (allowlisted && !hasRole) {
    const next = [...roles, PLATFORM_ADMIN_ROLE].join(",");
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
