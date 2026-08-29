import "server-only";

import { getAuthSession } from "@intelligo/auth";
import { createNotification } from "@intelligo/core/notifications";
import { createLogger } from "@intelligo/core/logger";

/**
 * Workspace bootstrap — composition-root binding for the app shell's one
 * extension point: what happens the first time `ensureUserWorkspace`
 * (`@intelligo/auth`) has to create a workspace for a user, instead of
 * finding an existing one.
 *
 * `@intelligo/auth` must not import `@intelligo/billing` — a product's
 * trial/referral/welcome-bonus rules are a business decision, not a
 * framework one, and importing them directly would recreate the very
 * auth → billing cycle `ensureUserWorkspace`'s callback parameter exists
 * to avoid. So the layout injects this callback instead of the package
 * importing anything. Per ADR-0005, that binding happens here, in a file
 * the composition root owns and calls explicitly — never as an import
 * side effect.
 *
 * The registry default provisions nothing. The reference app posts a
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
  email,
}: {
  workspaceId: string;
  email: string;
}): Promise<void> {
  try {
    const session = await getAuthSession();
    const userId = session?.user?.id;
    if (!userId) return;

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
