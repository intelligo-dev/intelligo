/**
 * Server-Side Auth Helpers
 *
 * Utilities for server components and server actions to check authentication.
 * These helpers use Better-Auth's session API with Next.js headers.
 *
 * Usage in server actions (TECH-10 pattern):
 * ```typescript
 * export async function myServerAction() {
 *   const { user } = await requireAuth();
 *   // ... proceed with authenticated user
 * }
 * ```
 */

import { headers } from "next/headers";
import { auth } from "./server";
import { createLogger } from "@intelligo-dev/core/logger";
import { db } from "@intelligo-dev/core/db";
import { users } from "@intelligo-dev/core/db/schema";
import { eq } from "drizzle-orm";
import type { Session, User } from "better-auth/types";
import { PLATFORM_ADMIN_ROLE } from "./roles";

/** Valid Better-Auth workspace roles. Used to type-check allowedRoles in requireRole(). */
export type WorkspaceRole = "owner" | "admin" | "member";

const log = createLogger("Auth");

/**
 * Get current auth session from request headers.
 *
 * Returns session and user if authenticated, null otherwise.
 * Use this in server components that handle both authenticated and unauthenticated states.
 */
export async function getAuthSession(): Promise<{
  session: Session;
  user: User;
} | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
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
 * Require authentication.
 *
 * Throws "Unauthorized" error if no valid session.
 * Use this in server actions to enforce authentication (TECH-10 pattern).
 *
 * @throws Error with "Unauthorized" message if not authenticated
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
 * Get workspace context by organization ID.
 * Use this when you know the org ID (e.g., just after creating/activating a workspace).
 *
 * @param organizationId - The organization ID to get context for
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

  // Get organization by ID directly (not from session)
  const org = await auth.api.getFullOrganization({
    headers: await headers(),
    query: { organizationId },
  });

  if (!org) {
    log.debug("getWorkspaceContextById: org not found");
    return null;
  }

  // Find user's membership
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
 * Get workspace context from the active organization in session.
 * Returns null if no active organization set.
 *
 * Use this in server components that need workspace context but can handle
 * the absence of an active workspace (e.g., workspace switcher UI).
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

  // Get active organization from session
  let activeOrg = await auth.api.getFullOrganization({
    headers: await headers(),
  });

  log.debug("getWorkspaceContext: active org", { hasOrg: !!activeOrg });

  // Fallback: If no active org in session, auto-select first available workspace
  if (!activeOrg) {
    log.debug("getWorkspaceContext: no active org, checking workspaces");
    const orgs: any = await auth.api.listOrganizations({
      headers: await headers(),
    });

    if (orgs && orgs.length > 0) {
      log.debug("getWorkspaceContext: found workspaces", {
        count: String(orgs.length),
      });
      // Fetch full organization details for the first workspace
      activeOrg = await auth.api.getFullOrganization({
        headers: await headers(),
        query: { organizationId: orgs[0].id },
      });
    }
  }

  if (!activeOrg) {
    log.debug("getWorkspaceContext: no workspaces found");
    return null;
  }

  // Find user's membership in the active org
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
 * Require workspace context. Use in server actions that need workspace scope (TECH-10).
 * Throws if not authenticated OR no active workspace selected.
 *
 * Use this in server actions that operate on workspace-scoped resources
 * (conversations, knowledge bases, usage logs, etc.).
 *
 * @throws Error with "No active workspace" message if no workspace selected
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
 * Require specific role in active workspace.
 * Use for admin/owner-only server actions (TEAM-08).
 *
 * Example: requireRole(["owner", "admin"]) for workspace settings actions.
 *
 * @param allowedRoles - Array of role names that are permitted
 * @throws Error with "Insufficient permissions" message if user lacks required role
 */
export async function requireRole(allowedRoles: WorkspaceRole[]): Promise<{
  session: Session;
  user: User;
  workspace: { id: string; name: string; slug: string; logo?: string | null };
  membership: { id: string; role: WorkspaceRole };
}> {
  const context = await requireWorkspace();
  if (!allowedRoles.includes(context.membership.role)) {
    throw new Error("Insufficient permissions");
  }
  return context;
}

/**
 * Require PLATFORM admin — distinct from workspace roles.
 *
 * Workspace `owner` is a per-tenant role: any user who creates a
 * workspace owns it. Platform-level surfaces (cross-workspace
 * analytics, the operational console, impersonation) must never be
 * gated on it.
 *
 * The authority is `users.role`. PLATFORM_ADMIN_EMAILS is the
 * bootstrap: an allowlisted user is promoted into the column the first
 * time they pass through here, so a fresh deployment has a way in and
 * every later check — including Better-Auth's admin plugin, which can
 * only read the row — agrees with this one. Two gates that can
 * disagree is how the cross-tenant analytics leak happened in the
 * first place.
 *
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
