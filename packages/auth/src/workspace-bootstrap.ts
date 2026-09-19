/**
 * What runs once a user's personal workspace exists: trial credits, a
 * welcome note, a referral bonus. The product decides, so auth takes it
 * as a handler set from the composition root and never imports billing.
 *
 * The workspace is created by the `user.create` hook at signup, or by
 * `ensureUserWorkspace` when that hook did not get to it; both call the
 * handler, for the one workspace each of them created.
 */

import { createLogger } from "@intelligo-dev/core/logger";
import { createRegistryRef } from "@intelligo-dev/core/registry";

const log = createLogger("WorkspaceBootstrap");

export type WorkspaceCreated = {
  workspaceId: string;
  userId: string;
  email: string;
};

export type WorkspaceCreatedHandler = (
  created: WorkspaceCreated
) => Promise<void>;

const handler = createRegistryRef<WorkspaceCreatedHandler | null>(
  "auth/workspace-created",
  null
);

/** Set from the composition root; the last call wins. */
export function setWorkspaceCreatedHandler(
  next: WorkspaceCreatedHandler
): void {
  handler.set(next);
}

export function clearWorkspaceCreatedHandler(): void {
  handler.set(null);
}

/**
 * Runs the handler without waiting for it: a failed bootstrap is
 * logged and never fails the signup that created the workspace.
 */
export function workspaceCreated(
  created: WorkspaceCreated,
  run: WorkspaceCreatedHandler | null = handler.get()
): void {
  if (!run) return;
  run(created).catch((error) =>
    log.error("Workspace bootstrap failed", {
      workspaceId: created.workspaceId,
      error: error instanceof Error ? error.message : String(error),
    })
  );
}
