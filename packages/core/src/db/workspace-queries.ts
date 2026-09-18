/**
 * Workspace scoping for tables with a `workspaceId` column. Every query on
 * such a table filters by the workspace resolved from `requireWorkspace()`.
 * Organization, member and invitation rows go through the Better-Auth API,
 * which scopes them to the caller's session.
 */

import { eq, and, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * Creates a workspace-scoped WHERE condition for any table with a workspaceId column.
 * Use it in every custom Drizzle query to enforce workspace isolation.
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
