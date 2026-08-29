/**
 * Notification Trigger System
 *
 * Checks quota and trial thresholds after each token recording and
 * sends real email and in-app notifications via notification trigger functions.
 *
 * The notification_history table prevents duplicate notifications per period.
 *
 * Functions:
 * - checkNotificationTriggers: Detect thresholds and trigger notifications
 *
 * Pattern: Fire-and-forget after recordTokenUsage (non-blocking).
 */

import { db } from "@intelligo/core/db";
import {
  notificationHistory,
  organization,
  users,
  member,
} from "@intelligo/core/db/schema";
import { eq, and } from "drizzle-orm";
import { getQuotaThresholds } from "./quota";
import { getTrialStatus } from "./trial";
import {
  triggerQuotaNotification,
  triggerTrialNotification,
} from "@intelligo/core/notifications";
import { getPlanMonthlyCreditMnt } from "./quota-plan";
import { getCurrentMonthlyUsage } from "./quota-usage";
import { getWorkspaceBilling } from "./queries";

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

// ---------------------------------------------------------------------------
// checkNotificationTriggers (QUOTA-08, QUOTA-09, TRIAL-04, TRIAL-05)
// ---------------------------------------------------------------------------

/**
 * Check all notification thresholds and record triggered notifications.
 *
 * Detects four threshold types:
 * - quota_warning_80: Monthly quota at 80% (QUOTA-08)
 * - quota_warning_100: Monthly quota at 100% (QUOTA-09)
 * - trial_warning_20: Trial credits at 20% remaining (TRIAL-04)
 * - trial_depleted: Trial credits fully used (TRIAL-05)
 *
 * Uses notification_history with unique constraint (workspaceId, type, periodKey)
 * to prevent duplicate notifications. onConflictDoNothing ensures idempotency.
 *
 * Returns the list of newly triggered notifications (empty if all already sent).
 */
export async function checkNotificationTriggers(
  workspaceId: string
): Promise<QuotaNotification[]> {
  const notifications: QuotaNotification[] = [];

  // Get billing data for MNT-based quota calculation
  const [billing, monthly] = await Promise.all([
    getWorkspaceBilling(workspaceId),
    getCurrentMonthlyUsage(workspaceId),
  ]);
  const planSlug = billing.plan?.slug ?? "free";
  const monthlyAllowanceMnt = getPlanMonthlyCreditMnt(planSlug);
  const chargedMnt = monthly.chargedMnt ?? 0;

  const percentage =
    monthlyAllowanceMnt > 0
      ? Math.min(100, Math.round((chargedMnt / monthlyAllowanceMnt) * 100))
      : 0;

  // Check subscription quota thresholds (QUOTA-08, QUOTA-09)
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

  // Check trial credit thresholds (TRIAL-04, TRIAL-05)
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
            // QUOTA notifications -> triggerQuotaNotification
            triggerQuotaNotification({
              userId: owner.userId,
              userEmail: owner.email,
              workspaceId,
              workspaceName: owner.workspaceName,
              percentageUsed: percentage,
              tokensUsed: chargedMnt,
              tokensLimit: monthlyAllowanceMnt,
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
            // TRIAL notifications -> triggerTrialNotification
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
