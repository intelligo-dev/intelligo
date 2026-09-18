/**
 * Checks quota and trial thresholds after each token recording and
 * sends email and in-app notifications. The notification_history table
 * prevents duplicate notifications per period.
 *
 * Called fire-and-forget after recordTokenUsage.
 */

import { db } from "@intelligo-dev/core/db";
import {
  notificationHistory,
  organization,
  users,
  member,
} from "@intelligo-dev/core/db/schema";
import { eq, and } from "drizzle-orm";
import { getQuotaThresholds } from "./quota";
import { getTrialStatus } from "./trial";
import {
  triggerQuotaNotification,
  triggerTrialNotification,
} from "@intelligo-dev/core/notifications";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuotaNotification = {
  type:
    | "quota_warning_80"
    | "quota_warning_100"
    | "trial_warning_20"
    | "trial_depleted";
  workspaceId: string;
  message: string;
  data: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up workspace owner's userId and email for notification delivery.
 * Returns null if workspace or owner not found.
 */
async function getWorkspaceOwner(workspaceId: string): Promise<{
  userId: string;
  email: string;
  workspaceName: string;
} | null> {
  const result = await db
    .select({
      workspaceName: organization.name,
      userId: users.id,
      email: users.email,
    })
    .from(organization)
    .innerJoin(member, eq(member.organizationId, organization.id))
    .innerJoin(users, eq(users.id, member.userId))
    .where(and(eq(organization.id, workspaceId), eq(member.role, "owner")))
    .limit(1);

  if (!result[0]) return null;
  return {
    userId: result[0].userId,
    email: result[0].email,
    workspaceName: result[0].workspaceName,
  };
}

/**
 * Check all notification thresholds and record triggered notifications.
 *
 * Detects four threshold types: quota_warning_80, quota_warning_100,
 * trial_warning_20 (20% of trial credits remaining) and trial_depleted.
 * A unique constraint on (workspaceId, type, periodKey) with
 * onConflictDoNothing makes each one fire once per period.
 *
 * Returns the newly triggered notifications (empty if all already sent).
 */
export async function checkNotificationTriggers(
  workspaceId: string
): Promise<QuotaNotification[]> {
  const notifications: QuotaNotification[] = [];

  // Subscription quota thresholds. The percentage and the amounts behind
  // it come from getQuotaThresholds rather than being derived a second
  // time here.
  const thresholds = await getQuotaThresholds(workspaceId);
  if (thresholds.criticalThreshold) {
    notifications.push({
      type: "quota_warning_100",
      workspaceId,
      message:
        "Your monthly token quota is fully used. Upgrade your plan for more tokens.",
      data: { percentage: thresholds.percentage },
    });
  } else if (thresholds.warningThreshold) {
    notifications.push({
      type: "quota_warning_80",
      workspaceId,
      message: "You've used 80% of your monthly token quota.",
      data: { percentage: thresholds.percentage },
    });
  }

  // Trial credit thresholds
  const trial = await getTrialStatus(workspaceId);
  if (trial.status === "depleted") {
    notifications.push({
      type: "trial_depleted",
      workspaceId,
      message:
        "Your trial credits are depleted. Subscribe to continue using AI features.",
      data: { creditsUsed: trial.creditsUsed },
    });
  } else if (trial.warningTriggered && trial.status === "active") {
    notifications.push({
      type: "trial_warning_20",
      workspaceId,
      message: `Only ${trial.creditsRemaining.toLocaleString()} trial credits remaining.`,
      data: {
        creditsRemaining: trial.creditsRemaining,
        percentageRemaining: trial.percentageRemaining,
      },
    });
  }

  // Record notifications to history (deduplication + audit trail)
  const now = new Date();
  const monthlyPeriodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  for (const notification of notifications) {
    const periodKey = notification.type.startsWith("trial_")
      ? "trial"
      : monthlyPeriodKey;

    try {
      const result = await db
        .insert(notificationHistory)
        .values({
          id: crypto.randomUUID(),
          workspaceId: notification.workspaceId,
          type: notification.type,
          periodKey,
          channel: "email",
          metadata: JSON.stringify(notification.data),
        })
        .onConflictDoNothing();

      // Only trigger notification if this is a new notification (not a duplicate)
      if (result.rowCount && result.rowCount > 0) {
        const owner = await getWorkspaceOwner(workspaceId);
        if (owner) {
          // Route to correct trigger based on notification type
          if (
            notification.type === "quota_warning_80" ||
            notification.type === "quota_warning_100"
          ) {
            triggerQuotaNotification({
              userId: owner.userId,
              userEmail: owner.email,
              workspaceId,
              workspaceName: owner.workspaceName,
              percentageUsed: thresholds.percentage,
              tokensUsed: thresholds.usedMicros,
              tokensLimit: thresholds.limitMicros,
              isExceeded: notification.type === "quota_warning_100",
            }).catch((err) =>
              console.error(
                `[Notification] Quota trigger failed for ${notification.type}:`,
                err
              )
            );
          } else if (
            notification.type === "trial_warning_20" ||
            notification.type === "trial_depleted"
          ) {
            triggerTrialNotification({
              userId: owner.userId,
              userEmail: owner.email,
              workspaceId,
              workspaceName: owner.workspaceName,
              creditsRemaining: trial.creditsRemaining,
              totalCredits: trial.initialCredits,
              percentageRemaining: trial.percentageRemaining,
              isDepleted: notification.type === "trial_depleted",
            }).catch((err) =>
              console.error(
                `[Notification] Trial trigger failed for ${notification.type}:`,
                err
              )
            );
          }
        }
      }
    } catch (error) {
      // Non-critical: don't block the request if notification recording fails
      console.error(
        `[Notification] Failed to record ${notification.type}:`,
        error
      );
    }
  }

  return notifications;
}
