import "server-only";

import type { WorkspaceCreated } from "@intelligo-dev/auth";
import { createNotification } from "@intelligo-dev/core/notifications";
import { createLogger } from "@intelligo-dev/core/logger";

/**
 * What a user's personal workspace starts with, set from the composition
 * root with `setWorkspaceCreatedHandler` (`@intelligo-dev/auth`). It runs
 * once, when the signup hook — or `ensureUserWorkspace`, if the hook did
 * not get to it — creates the workspace.
 *
 * `@intelligo-dev/auth` must not import `@intelligo-dev/billing`: a
 * product's trial/referral/welcome-bonus rules are a business decision,
 * not a framework one. So the product hands auth this handler instead of
 * the package importing anything.
 *
 * The scaffold's default provisions nothing. The reference app posts a
 * welcome notification, which is also what stops `/notifications` from
 * being a page that can only ever be empty: nothing else in a fresh
 * install writes one until somebody accepts a team invitation.
 *
 * Failure here must not block workspace creation — a missing welcome
 * note is not worth failing a signup over.
 */

const log = createLogger("WorkspaceBootstrap");

export async function onWorkspaceCreated({
  workspaceId,
  userId,
  email,
}: WorkspaceCreated): Promise<void> {
  try {
    await createNotification({
      userId,
      workspaceId,
      // `subscription_confirmed` is the closest existing type for a
      // "you're set up" note; the bell renders its check icon for it.
      type: "subscription_confirmed",
      title: "Welcome to your workspace",
      message:
        "Start a chat to see usage metering, artifacts, and billing work end to end.",
      // `metadata.href` is what makes the row a link (see actions/notifications).
      metadata: { href: "/chat", email },
    });
  } catch (error) {
    log.error("Welcome notification failed", {
      workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
