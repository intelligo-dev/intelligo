import "server-only";

/**
 * Binds billing into the workspace service (`@intelligo-dev/auth`): the
 * plan's workspace limit (`checkPlanLimit`), and ending the Stripe
 * subscription of a workspace before it is deleted
 * (`cancelWorkspaceSubscription`).
 *
 * `checkPlanLimit` is keyed by `workspaceId`, but the service's
 * `checkWorkspaceLimit` port is keyed by `userId`: a new workspace has
 * no id to check a plan against yet. This binding checks the plan of
 * the oldest workspace the user owns — not one they were invited into,
 * whose plan someone else pays for.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@intelligo-dev/core/db";
import { member } from "@intelligo-dev/core/db/schema";
import { createWorkspaceService } from "@intelligo-dev/auth";
import {
  cancelWorkspaceSubscription,
  checkPlanLimit,
} from "@intelligo-dev/billing";

export const workspace = createWorkspaceService({
  checkWorkspaceLimit: async (userId, currentCount) => {
    const [membership] = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(and(eq(member.userId, userId), eq(member.role, "owner")))
      .orderBy(member.createdAt)
      .limit(1);

    // No owned workspace to price a plan against yet — allow. The
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
  beforeDeleteWorkspace: cancelWorkspaceSubscription,
});
