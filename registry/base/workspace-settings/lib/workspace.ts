import "server-only";

/**
 * Workspace service binding — the composition-root wiring for the
 * workspace-settings item. Binds the plan-defined workspace limit
 * (`@intelligo-dev/billing`'s `checkPlanLimit`) into the framework-owned
 * workspace service (`@intelligo-dev/auth`).
 *
 * `checkPlanLimit` is keyed by `workspaceId`, but the service's
 * `checkWorkspaceLimit` port is keyed by `userId` — a new workspace
 * has no id of its own yet to check a plan against (see
 * `createWorkspaceService`'s module doc comment for the full
 * rationale). This binding resolves a representative workspace for
 * the user (their oldest membership) and checks that workspace's plan,
 * the same stand-in acme's original action used.
 */

import { eq } from "drizzle-orm";

import { db } from "@intelligo-dev/core/db";
import { member } from "@intelligo-dev/core/db/schema";
import { createWorkspaceService } from "@intelligo-dev/auth";
import { checkPlanLimit } from "@intelligo-dev/billing";

export const workspace = createWorkspaceService({
  checkWorkspaceLimit: async (userId, currentCount) => {
    const [membership] = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(eq(member.userId, userId))
      .orderBy(member.createdAt)
      .limit(1);

    // No existing workspace to price a plan against yet — allow. The
    // service itself never calls this port for a caller's first
    // workspace, but a defensive default keeps this binding correct on
    // its own too.
    if (!membership) {
      return { allowed: true, limit: -1 };
    }

    const result = await checkPlanLimit(
      membership.organizationId,
      "workspaces",
      currentCount
    );
    return { allowed: result.allowed, limit: result.limit };
  },
});
