/**
 * Ensures every authenticated user has a workspace; called from the
 * authenticated layout on every render. Post-creation work (trial
 * provisioning) arrives as a callback, so auth never imports billing.
 */

import { auth } from "./server";
import type { User } from "better-auth/types";
import { createLogger } from "@intelligo-dev/core/logger";
import { personalWorkspaceSlug } from "./workspace-slug";

const log = createLogger("WorkspaceInit");

/**
 * Ensure the user has at least one workspace.
 *
 * If the session already has a valid active workspace, returns it
 * untouched; otherwise sets the first workspace as active. If none
 * exist, creates a personal workspace, in case the user.create hook has not
 * completed yet or the user was created outside Better-Auth. Idempotent.
 *
 * @param user - Authenticated user from session
 * @param headers - Request headers (required for Better-Auth API)
 * @param options.onWorkspaceCreated - Optional callback invoked after a new workspace is created.
 *   Receives workspaceId and email. Fire-and-forget: a failure is logged, never thrown.
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

  const orgs = await auth.api.listOrganizations({
    headers,
  });

  log.info("Found organizations", { count: orgs?.length ?? 0 });

  if (orgs && orgs.length > 0 && orgs[0]) {
    // Keep a workspace the user switched to while they are still a
    // member; resetting to orgs[0] would undo every switch on re-render.
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

  // No workspace yet: create one. The unique index on organization.slug
  // prevents duplicates when the hook or a concurrent request also creates
  // it, because `personalWorkspaceSlug` is derived from the user; the loser
  // takes the adopt-the-winner path below.
  log.warn("No workspace found, creating one (hook may still fire)", {
    email: user.email,
  });

  let workspaceId: string;
  try {
    const result = await auth.api.createOrganization({
      headers,
      body: {
        name: `${user.name || "User"}'s Workspace`,
        slug: personalWorkspaceSlug(user.email, user.id),
        userId: user.id,
      },
    });
    if (!result) {
      throw new Error("createOrganization returned no result");
    }
    workspaceId = result.id;
    log.info("Created fallback workspace", { workspaceId });
  } catch (error) {
    // A concurrent creator may have won the unique index; if a workspace
    // now exists, use it.
    const orgsAfter = await auth.api.listOrganizations({ headers });
    if (orgsAfter && orgsAfter.length > 0 && orgsAfter[0]) {
      log.info("Workspace created concurrently by hook, using it");
      await auth.api.setActiveOrganization({
        headers,
        body: { organizationId: orgsAfter[0].id },
      });
      return orgsAfter[0].id;
    }
    log.error("Failed to create fallback workspace", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  // Point the session at the new workspace, or later requests that resolve
  // one from the session alone find none. Not fatal (the next request sets
  // it), so a failure is logged rather than thrown.
  try {
    await auth.api.setActiveOrganization({
      headers,
      body: { organizationId: workspaceId },
    });
    log.info("Set new workspace active", { workspaceId });
  } catch (error) {
    log.error("Failed to set the new workspace active", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

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
