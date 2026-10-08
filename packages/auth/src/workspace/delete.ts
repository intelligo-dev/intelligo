/**
 * Deleting a workspace around the `beforeDeleteWorkspace` port, shared by
 * the workspace service (an owner deletes one) and the profile service (an
 * account takes the workspaces it owns alone with it).
 */

import { createLogger } from "@intelligo-dev/core/logger";

import { auth } from "../server";

const log = createLogger("WorkspaceDeletion");

/**
 * What `beforeDeleteWorkspace` may hand back: told whether the deletion
 * happened, it finishes what the port began — a subscription scheduled to
 * end is cancelled at once, or set to renew again.
 */
export type WorkspaceDeletionSettle = (deleted: boolean) => Promise<void>;

/**
 * Runs before a workspace is deleted, after the owner check. Whatever
 * outlives the row has to be ended here — a paid subscription keeps billing
 * the customer otherwise. A throw stops the deletion. Anything that cannot
 * be undone belongs in the returned settle function, which runs once the
 * deletion has succeeded or failed.
 */
export type BeforeDeleteWorkspace = (
  workspaceId: string
) => Promise<void | WorkspaceDeletionSettle | undefined>;

/** The port failed, so nothing was deleted. */
export class WorkspacePreparationError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "WorkspacePreparationError";
    (this as { cause?: unknown }).cause = cause;
    Object.setPrototypeOf(this, WorkspacePreparationError.prototype);
  }
}

/**
 * Prepare with the port, delete the organization, then settle. A settle
 * that fails is logged and never fails the deletion it follows. Throws
 * `WorkspacePreparationError` when the port throws, or what the delete
 * threw.
 */
export async function deleteWorkspaceWithPort(
  workspaceId: string,
  headers: Headers,
  beforeDelete?: BeforeDeleteWorkspace
): Promise<void> {
  let settle: WorkspaceDeletionSettle | undefined;
  if (beforeDelete) {
    try {
      settle = (await beforeDelete(workspaceId)) ?? undefined;
    } catch (error) {
      throw new WorkspacePreparationError(error);
    }
  }

  const finish = async (deleted: boolean) => {
    if (!settle) return;
    try {
      await settle(deleted);
    } catch (error) {
      log.error("Settling a workspace deletion failed", {
        workspaceId,
        deleted,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  try {
    await auth.api.deleteOrganization({
      headers,
      body: { organizationId: workspaceId },
    });
  } catch (error) {
    await finish(false);
    throw error;
  }
  await finish(true);
}
