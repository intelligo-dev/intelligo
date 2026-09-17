/**
 * Workspace management service — the durable business rules behind
 * workspace listing, creation, switching, editing and deletion,
 * lifted out of the first product's workspace actions (page/registry
 * migration, `workspace-settings` family, roadmap item 8).
 *
 * Mirrors `createTeamService(ports)` (./../team/service.ts) one
 * directory over: a factory over optional ports, so this package's
 * allowlisted dependency (`@intelligo-dev/core` only — see
 * tests/architecture/dependency-direction.test.ts) never grows to
 * include billing. A consumer binds that in at its composition root:
 *
 *   const workspaceService = createWorkspaceService({
 *     checkWorkspaceLimit: ...,   // adapts @intelligo-dev/billing's checkPlanLimit
 *   });
 *
 * Authorization (`requireAuth`/`requireWorkspace`/`requireRole`) lives
 * INSIDE each method, not at the transport. Every recognized failure
 * throws `WorkspaceServiceError` with a stable `code` — no
 * revalidatePath/Sentry/next-intl/toast here; that shaping is the
 * transport's job (a Server Action, a route handler).
 *
 * ---------------------------------------------------------------------
 * Why `checkWorkspaceLimit` takes a `userId`, not a `workspaceId`
 * ---------------------------------------------------------------------
 * `createWorkspace` has no workspace to check the plan of yet — it is
 * the thing being created. The product's original action worked around this
 * by reading the caller's *existing* workspaces and using the first
 * one's id to look up a plan via `@intelligo-dev/billing`'s
 * `checkPlanLimit(workspaceId, "workspaces", currentCount)`, i.e. it
 * borrowed an arbitrary existing workspace's subscription as a stand-in
 * for "the caller's plan". That borrowing is a binding-layer concern,
 * not a service-layer one: this service only knows the caller's
 * `userId` and how many workspaces they already have. The composition
 * root's binding (`checkWorkspaceLimit`) is where a consumer decides
 * how to resolve "this user's plan" — by reading their first workspace
 * the same way the first product did, or by a real per-user plan lookup if one
 * exists.
 *
 * ---------------------------------------------------------------------
 * The two Better-Auth pitfalls (already solved in ../team/service.ts —
 * copied here rather than re-derived)
 * ---------------------------------------------------------------------
 * 1. Method-name mismatch: the typed `orgApi` wrapper (../org-api.ts)
 *    exists precisely because `auth.api`'s organization-plugin methods
 *    are keyed by their own camelCase *server* id, which does not
 *    always match the HTTP path or the client SDK name. This service
 *    uses `orgApi["/organization/list"]` and
 *    `orgApi["/organization/set-active"]` for the two calls the
 *    wrapper covers, and calls `auth.api.{createOrganization,
 *    updateOrganization, deleteOrganization, getFullOrganization}`
 *    directly for the base organization CRUD surface, which is not
 *    part of `orgApi`'s typed table (the same approach
 *    `../team/service.ts` takes for `getFullOrganization`). The product's
 *    original `actions/workspace.ts` already called these four by
 *    their correct `auth.api` names directly (it never went through a
 *    path-keyed cast), so there is no method-name bug to fix here.
 * 2. `sessions.activeOrganizationId` exists and persists switches, but
 *    a bare `auth.api.getFullOrganization({ headers })` resolves to
 *    *no* organization whenever the session has none set (see
 *    `../team/service.ts`'s module comment). This service's
 *    `getActiveWorkspace` therefore resolves the caller's workspace via
 *    `requireWorkspace()` first (which has its own explicit-id
 *    fallback) and passes that id explicitly to `getFullOrganization`.
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
   * Plan-defined workspace cap for the caller. No port ⇒ unlimited (no
   * gate applied) — matches "no billing dependency without one bound
   * explicitly". Not consulted when the caller has zero
   * existing workspaces (their first workspace is always allowed) —
   * see the module doc comment for why the port is keyed by `userId`
   * rather than `workspaceId`.
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

  /**
   * List all workspaces for the current user.
   */
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

  /**
   * Switch the caller's active workspace.
   */
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

  /**
   * Update workspace settings (name/slug/logo). Owner/admin only.
   */
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
   * Get the caller's active workspace, fully resolved. Unlike
   * the original action (see the module doc comment), this resolves the
   * workspace id explicitly via `requireWorkspace()` rather than
   * relying on a non-existent `sessions.activeOrganizationId` fallback.
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
