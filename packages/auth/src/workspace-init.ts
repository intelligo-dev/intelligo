/**
 * Workspace Initialization
 *
 * Ensures every authenticated user has at least one workspace.
 * Called from the (app) layout to guarantee workspace exists.
 * Idempotent - safe to call on every page load.
 *
 * Pattern: "Belt-and-suspenders" approach consistent with Phase 9.
 * Better-Auth doesn't provide a reliable hook for post-signup workspace creation,
 * so we check + create on every authenticated page load.
 *
 * Dependency Inversion (Phase 42, PKG-01 preparation):
 * Post-creation logic (e.g., trial provisioning) is injected via callback,
 * so this module has ZERO billing imports. The actual billing call lives
 * in the consumer application's authenticated layout, which already
 * imports billing.
 * This breaks the auth → billing circular dependency before Phase 43 extraction.
 */

import { auth } from "./server";
import type { User } from "better-auth/types";
import { createLogger } from "@intelligo-dev/core/logger";

const log = createLogger("WorkspaceInit");

/**
 * Ensure user has at least one workspace (WORK-01).
 *
 * If the session already has a valid active workspace, returns it
 * untouched; otherwise sets the first workspace as active. If none
 * exist, creates a personal workspace — this serves as a fallback in case the
 * user.create hook (server.ts databaseHooks) hasn't completed yet, and
 * also handles users created via non-Better-Auth flows (e.g. admin panel).
 *
 * Idempotent - safe to call repeatedly. Returns quickly if workspace exists.
 *
 * @param user - Authenticated user from session
 * @param headers - Request headers (required for Better-Auth API)
 * @param options.onWorkspaceCreated - Optional callback invoked after a new workspace is created.
 *   Receives workspaceId and email. Failure does NOT block workspace creation (same fire-and-forget
 *   behavior as the previous inline trial provisioning call).
 * @returns The organization ID that was set as active (useful for immediate access before session updates)
 */
export async function ensureUserWorkspace(
  user: User,
  headers: Headers,
  options?: {
    onWorkspaceCreated?: (params: {
      workspaceId: string;
      email: string;
    }) => Promise<void>;
  }
): Promise<string> {
  log.info("Starting workspace check", { email: user.email });

  // Check if user has any organizations
  const orgs = await auth.api.listOrganizations({
    headers,
  });

  log.info("Found organizations", { count: orgs?.length ?? 0 });

  if (orgs && orgs.length > 0 && orgs[0]) {
    // The session already names a workspace the user switched to, and
    // they are still a member of it: keep it. Resetting to orgs[0] on
    // every authenticated render — which is what this did — undid every
    // switch as soon as the layout re-rendered.
    const current = await auth.api.getSession({ headers });
    const active = (
      current?.session as { activeOrganizationId?: string | null } | undefined
    )?.activeOrganizationId;
    if (active && orgs.some((org) => org.id === active)) {
      log.debug("Active workspace still valid, keeping it", { orgId: active });
      return active;
    }

    log.debug("No valid active workspace, setting first as active");
    try {
      await auth.api.setActiveOrganization({
        headers,
        body: { organizationId: orgs[0].id },
      });
      log.info("Set active organization", { orgId: orgs[0].id });
    } catch (error) {
      log.error("Failed to set active organization", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    return orgs[0].id;
  }

  // TR-DB03 fix: No organizations found — the user.create hook may not have
  // completed yet, or user was created via a non-Better-Auth flow.
  // Create the workspace here as a fallback rather than throwing.
  // Idempotent: the unique constraint on organization.slug prevents duplicates
  // if both this fallback and the hook fire for the same signup.
  log.warn("No workspace found, creating one (hook may still fire)", {
    email: user.email,
  });
  const slug = ((user.email || "user").split("@")[0] || "user")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, 30);

  let workspaceId: string;
  try {
    const result = await auth.api.createOrganization({
      headers,
      body: {
        name: `${user.name || "User"}'s Workspace`,
        slug: `${slug}-${Date.now().toString(36)}`,
        userId: user.id,
      },
    });
    if (!result) {
      throw new Error("createOrganization returned no result");
    }
    workspaceId = result.id;
    log.info("Created fallback workspace", { workspaceId });
  } catch (error) {
    // If creation failed because the unique constraint was hit (hook already
    // created), the error message contains the duplicate key info.
    // List orgs again — if one now exists, use it.
    const orgsAfter = await auth.api.listOrganizations({ headers });
    if (orgsAfter && orgsAfter.length > 0 && orgsAfter[0]) {
      log.info("Workspace created concurrently by hook, using it");
      await auth.api.setActiveOrganization({
        headers,
        body: { organizationId: orgsAfter[0].id },
      });
      return orgsAfter[0].id;
    }
    // Genuine failure
    log.error("Failed to create fallback workspace", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  // Fire the optional callback (trial credits, referral tracking, etc.)
  if (options?.onWorkspaceCreated) {
    options
      .onWorkspaceCreated({ workspaceId, email: user.email })
      .catch((err) =>
        log.error("onWorkspaceCreated callback failed", {
          error: err instanceof Error ? err.message : String(err),
        })
      );
  }

  return workspaceId;
}
