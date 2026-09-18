/**
 * Workspace listing, creation, switching, editing and deletion. Each method
 * authorizes itself and throws `WorkspaceServiceError`; the plan limit
 * arrives as the `checkWorkspaceLimit` port bound at the composition root.
 * `getFullOrganization` always gets an explicit `organizationId`, because a
 * bare call resolves to nothing when the session has no active organization.
 */

import { getRequestHeaders } from "@intelligo-dev/core/request-context";
import type { ZodType } from "zod";
import { createLogger } from "@intelligo-dev/core/logger";

import { auth } from "../server";
import { requireAuth, requireRole, requireWorkspace } from "../helpers";
import { orgApi, type OrgListItem } from "../org-api";
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
} from "./schemas";
import { WorkspaceServiceError, isWorkspaceServiceError } from "./errors";

const log = createLogger("WorkspaceService");

/** Minimal organization shape returned by create/update/getActiveWorkspace. */
export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  [key: string]: unknown;
}

export type WorkspaceServicePorts = {
  /**
   * Plan-defined workspace cap for the caller. No port ⇒ unlimited. Not
   * consulted for the caller's first workspace. Keyed by `userId` because
   * the workspace being created has no plan yet; how "this user's plan" is
   * resolved is the binding's decision.
   */
  checkWorkspaceLimit?: (
    userId: string,
    currentCount: number
  ) => Promise<{ allowed: boolean; limit: number }>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Maps requireAuth/requireWorkspace/requireRole failures to `forbidden`. */
function toForbidden(error: unknown): WorkspaceServiceError {
  if (isWorkspaceServiceError(error)) return error;
  return new WorkspaceServiceError("forbidden", errorMessage(error), {
    cause: error,
  });
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new WorkspaceServiceError(
      "invalid_input",
      result.error.issues.map((issue) => issue.message).join("; ") ||
        "Invalid input",
      { cause: result.error }
    );
  }
  return result.data;
}

/** Derives a URL-safe slug base from a workspace name. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

export function createWorkspaceService(ports: WorkspaceServicePorts = {}) {
  async function callRequireAuth() {
    try {
      return await requireAuth();
    } catch (error) {
      throw toForbidden(error);
    }
  }

  async function callRequireWorkspace() {
    try {
      return await requireWorkspace();
    } catch (error) {
      throw toForbidden(error);
    }
  }

  async function callRequireRole(
    allowedRoles: Array<"owner" | "admin" | "member">
  ) {
    try {
      return await requireRole(allowedRoles);
    } catch (error) {
      throw toForbidden(error);
    }
  }

  /** Wraps a Better-Auth org-plugin call; unrecognized failures become `provider_error`. */
  async function callOrgApi<T>(
    context: string,
    fn: () => Promise<T>
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (isWorkspaceServiceError(error)) throw error;
      log.error("Org API call failed", { context, error: errorMessage(error) });
      throw new WorkspaceServiceError(
        "provider_error",
        `Better-Auth organization API call failed (${context})`,
        { cause: error }
      );
    }
  }

  /** Every workspace the current user belongs to. */
  async function listWorkspaces(): Promise<OrgListItem[]> {
    await callRequireAuth();
    const hdrs = await getRequestHeaders();

    const orgs = await callOrgApi("list", () =>
      orgApi["/organization/list"]({ headers: hdrs })
    );

    return orgs ?? [];
  }

  /**
   * Create a new workspace. Auto-generates a slug from the name if not
   * provided, and appends a uniqueness suffix (Better-Auth requires
   * unique slugs). The caller's first workspace is always allowed; the
   * limit port, when bound, gates every workspace after that. The new
   * workspace is auto-activated on success.
   */
  async function createWorkspace(
    input: CreateWorkspaceInput
  ): Promise<WorkspaceRecord> {
    const { user } = await callRequireAuth();
    const validated = parseInput(createWorkspaceSchema, input);
    const hdrs = await getRequestHeaders();

    const existing = await callOrgApi("list", () =>
      orgApi["/organization/list"]({ headers: hdrs })
    );
    const existingCount = existing?.length ?? 0;

    if (ports.checkWorkspaceLimit && existingCount > 0) {
      const limitCheck = await ports.checkWorkspaceLimit(
        user.id,
        existingCount
      );
      if (!limitCheck.allowed) {
        throw new WorkspaceServiceError(
          "workspace_limit_reached",
          `Your plan allows up to ${limitCheck.limit} workspace${
            limitCheck.limit === 1 ? "" : "s"
          }. Upgrade to create more workspaces.`,
          { meta: { limit: limitCheck.limit } }
        );
      }
    }

    const slugBase = validated.slug || slugify(validated.name);
    // Append timestamp for uniqueness (Better-Auth requires unique slugs).
    const slug = `${slugBase}-${Date.now().toString(36)}`;

    const org = (await callOrgApi("create", () =>
      auth.api.createOrganization({
        headers: hdrs,
        body: { name: validated.name, slug },
      })
    )) as WorkspaceRecord | null;

    if (!org) {
      throw new WorkspaceServiceError(
        "provider_error",
        "Failed to create workspace"
      );
    }

    await callOrgApi("set-active", () =>
      orgApi["/organization/set-active"]({
        headers: hdrs,
        body: { organizationId: org.id },
      })
    );

    return org;
  }

  /** Switch the caller's active workspace. */
  async function switchWorkspace(organizationId: string): Promise<void> {
    await callRequireAuth();

    if (typeof organizationId !== "string" || organizationId.length === 0) {
      throw new WorkspaceServiceError("invalid_input", "Invalid workspace id");
    }

    const hdrs = await getRequestHeaders();

    await callOrgApi("set-active", () =>
      orgApi["/organization/set-active"]({
        headers: hdrs,
        body: { organizationId },
      })
    );
  }

  /** Update workspace settings (name/slug/logo). Owner/admin only. */
  async function updateWorkspace(
    input: UpdateWorkspaceInput
  ): Promise<WorkspaceRecord> {
    const { workspace } = await callRequireRole(["owner", "admin"]);
    const validated = parseInput(updateWorkspaceSchema, input);
    const hdrs = await getRequestHeaders();

    const updateData: { name?: string; slug?: string; logo?: string } = {};
    if (validated.name) updateData.name = validated.name;
    if (validated.slug) updateData.slug = validated.slug;
    if (validated.logo) updateData.logo = validated.logo;

    const result = (await callOrgApi("update", () =>
      auth.api.updateOrganization({
        headers: hdrs,
        body: { data: updateData, organizationId: workspace.id },
      })
    )) as WorkspaceRecord | null;

    if (!result) {
      throw new WorkspaceServiceError(
        "provider_error",
        "Failed to update workspace"
      );
    }

    return result;
  }

  /**
   * Delete the caller's active workspace. Owner only. Switches the
   * caller to another workspace afterward, if one remains.
   */
  async function deleteWorkspace(): Promise<void> {
    const { workspace } = await callRequireRole(["owner"]);
    const hdrs = await getRequestHeaders();

    await callOrgApi("delete", () =>
      auth.api.deleteOrganization({
        headers: hdrs,
        body: { organizationId: workspace.id },
      })
    );

    const orgs = await callOrgApi("list", () =>
      orgApi["/organization/list"]({ headers: hdrs })
    );
    if (orgs && orgs.length > 0) {
      await callOrgApi("set-active", () =>
        orgApi["/organization/set-active"]({
          headers: hdrs,
          body: { organizationId: orgs[0]!.id },
        })
      );
    }
  }

  /**
   * The caller's active workspace, fully resolved. The id comes from
   * `requireWorkspace()`, which falls back to the first workspace when the
   * session has none active.
   */
  async function getActiveWorkspace(): Promise<WorkspaceRecord> {
    const { workspace } = await callRequireWorkspace();
    const hdrs = await getRequestHeaders();

    const org = (await callOrgApi("getFullOrganization", () =>
      auth.api.getFullOrganization({
        headers: hdrs,
        query: { organizationId: workspace.id },
      })
    )) as WorkspaceRecord | null;

    if (!org) {
      throw new WorkspaceServiceError("not_found", "Workspace not found");
    }

    return org;
  }

  return {
    listWorkspaces,
    createWorkspace,
    switchWorkspace,
    updateWorkspace,
    deleteWorkspace,
    getActiveWorkspace,
  };
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>;
