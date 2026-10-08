/**
 * Checks quota and trial thresholds after each token recording and
 * sends email and in-app notifications. The notification_history table
 * prevents duplicate notifications per period.
 *
 * The plan allowance is money in the deployment's billing currency, so
 * the quota notices state amounts of it. Trial credits are a count.
 *
 * Called fire-and-forget after recordTokenUsage.
 */

import { eq } from "drizzle-orm";

import { db } from "@intelligo-dev/core/db";
import { notificationHistory } from "@intelligo-dev/core/db/schema";
import { formatMoney, money } from "@intelligo-dev/core/money";
import { getBillingSettings } from "./billing-settings";
import { getQuotaThresholds } from "./quota";
import { getCurrentPeriodKey } from "./quota-usage";
import { getTrialStatus } from "./trial";
import {
  triggerQuotaNotification,
  triggerTrialNotification,
} from "@intelligo-dev/core/notifications";
import { getWorkspaceOwner } from "./webhook-helpers";

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

/** The locale `QuotaNotification.message` is written in. */
const MESSAGE_LOCALE = "en";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check all notification thresholds and record triggered notifications.
 *
 * Detects four threshold types: quota_warning_80, quota_warning_100,
 * trial_warning_20 (20% of the trial grant remaining) and
 * trial_depleted. A unique constraint on (workspaceId, type, periodKey)
 * with onConflictDoNothing makes each one fire once per period: the row
 * is claimed first, and dropped again when the notice could not be
 * delivered, so a later call retries it.
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
  // The thresholds are micros of the billing currency, which
  // getQuotaThresholds read from the same cached settings.
  const { currency } = await getBillingSettings();
  const used = money(thresholds.usedMicros, currency);
  const allowance = money(thresholds.limitMicros, currency);
  const quotaData = {
    percentage: thresholds.percentage,
    usedMicros: used.amount,
    allowanceMicros: allowance.amount,
    currency,
  };
  if (thresholds.criticalThreshold) {
    notifications.push({
      type: "quota_warning_100",
      workspaceId,
      message: `Your ${formatMoney(allowance, MESSAGE_LOCALE)} monthly allowance is fully used. Upgrade your plan for more.`,
      data: quotaData,
    });
  } else if (thresholds.warningThreshold) {
    notifications.push({
      type: "quota_warning_80",
      workspaceId,
      message: `You've used ${formatMoney(used, MESSAGE_LOCALE)} of your ${formatMoney(allowance, MESSAGE_LOCALE)} monthly allowance (${thresholds.percentage}%).`,
      data: quotaData,
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
      message: `Only ${trial.percentageRemaining}% of your trial remains.`,
      data: {
        creditsRemaining: trial.creditsRemaining,
        percentageRemaining: trial.percentageRemaining,
      },
    });
  }

  // Record notifications to history (deduplication + audit trail)
  const monthlyPeriodKey = getCurrentPeriodKey();

  for (const notification of notifications) {
    const periodKey = notification.type.startsWith("trial_")
      ? "trial"
      : monthlyPeriodKey;

    const id = crypto.randomUUID();
    try {
      const result = await db
        .insert(notificationHistory)
        .values({
          id,
          workspaceId: notification.workspaceId,
          type: notification.type,
          periodKey,
          channel: "email",
          metadata: JSON.stringify(notification.data),
        })
        .onConflictDoNothing();

      // Only a call that claimed the row sends; the others see it taken.
      if (!result.rowCount) continue;

      try {
        const owner = await getWorkspaceOwner(workspaceId);
        if (!owner) continue;
        if (
          notification.type === "quota_warning_80" ||
          notification.type === "quota_warning_100"
        ) {
          await triggerQuotaNotification({
            userId: owner.userId,
            userEmail: owner.email,
            workspaceId,
            workspaceName: owner.workspaceName,
            percentageUsed: thresholds.percentage,
            used,
            allowance,
            isExceeded: notification.type === "quota_warning_100",
          });
        } else {
          await triggerTrialNotification({
            userId: owner.userId,
            userEmail: owner.email,
            workspaceId,
            workspaceName: owner.workspaceName,
            creditsRemaining: trial.creditsRemaining,
            totalCredits: trial.initialCredits,
            percentageRemaining: trial.percentageRemaining,
            isDepleted: notification.type === "trial_depleted",
          });
        }
      } catch (deliveryError) {
        // Not delivered: give the claim back so the next check retries.
        await db
          .delete(notificationHistory)
          .where(eq(notificationHistory.id, id));
        throw deliveryError;
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
