/**
 * Workspace-Scoped Query Helpers (WORK-06: Data Isolation)
 *
 * DATA ISOLATION MODEL:
 * - Phase 10 workspace/team operations use Better-Auth organization plugin API exclusively.
 *   These APIs provide inherent data isolation — all operations are scoped to the
 *   authenticated user's session and active organization. No raw DB queries needed.
 *
 *   Better-Auth API isolation guarantees:
 *   - auth.api.listOrganizations() — returns ONLY organizations the authenticated user belongs to
 *   - auth.api.getFullOrganization({ query: { organizationId } }) — returns that organization
 *     only if the caller is a member (FORBIDDEN otherwise); without an id it resolves the
 *     session's active organization, or nothing
 *   - auth.api.createInvitation() — requires organizationId from requireWorkspace() (authenticated context)
 *   - auth.api.removeMember() — scoped to the organizationId from requireWorkspace()
 *   - All other org API methods operate on the authenticated user's session context
 *
 * - Future phases (11+) will add product-specific tables (conversations, knowledge_bases,
 *   usage_logs, etc.) that contain a workspaceId column. ALL queries on these tables
 *   MUST use the helpers below to enforce workspace-scoped data isolation.
 *
 * USAGE PATTERN (for future phases):
 *   import { withWorkspaceFilter } from "@intelligo-dev/core/db/workspace-queries";
 *   import { requireWorkspace } from "@intelligo-dev/auth";
 *
 *   const { workspace } = await requireWorkspace();
 *   const conversations = await db
 *     .select()
 *     .from(conversationsTable)
 *     .where(withWorkspaceFilter(conversationsTable.workspaceId, workspace.id));
 */

import { eq, and, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * Creates a workspace-scoped WHERE condition for any table with a workspaceId column.
 * Use this in all custom Drizzle queries to enforce data isolation (WORK-06).
 *
 * @param workspaceIdColumn - The workspaceId column from the table schema
 * @param workspaceId - The active workspace ID from requireWorkspace()
 * @returns SQL condition: workspaceId = ?
 *
 * @example
 * ```typescript
 * const { workspace } = await requireWorkspace();
 * const conversations = await db
 *   .select()
 *   .from(conversationsTable)
 *   .where(workspaceEq(conversationsTable.workspaceId, workspace.id));
 * ```
 */
export function workspaceEq(
  workspaceIdColumn: PgColumn,
  workspaceId: string
): SQL {
  return eq(workspaceIdColumn, workspaceId);
}

/**
 * Combines a workspace scope condition with additional WHERE conditions.
 * Convenience helper to ensure workspaceId is always the first filter.
 *
 * @param workspaceIdColumn - The workspaceId column from the table schema
 * @param workspaceId - The active workspace ID from requireWorkspace()
 * @param additionalConditions - Extra WHERE conditions to AND together
 * @returns Combined SQL condition: workspaceId = ? AND ...
 *
 * @example
 * ```typescript
 * const { workspace } = await requireWorkspace();
 * const activeConversations = await db
 *   .select()
 *   .from(conversationsTable)
 *   .where(
 *     withWorkspaceFilter(
 *       conversationsTable.workspaceId,
 *       workspace.id,
 *       eq(conversationsTable.status, "active")
 *     )
 *   );
 * ```
 */
export function withWorkspaceFilter(
  workspaceIdColumn: PgColumn,
  workspaceId: string,
  ...additionalConditions: SQL[]
): SQL {
  return and(eq(workspaceIdColumn, workspaceId), ...additionalConditions)!;
}
