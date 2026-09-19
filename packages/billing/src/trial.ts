/**
 * Trial credits: provisioning, status, deduction, conversion and
 * expiry. Trial credits are separate from purchased credits
 * (credit_balances) and act as a fallback when plan quota is exceeded
 * or the credit balance is zero.
 */

import { db } from "@intelligo-dev/core/db";
import {
  trialCredits,
  notificationHistory,
  organization,
  users,
  member,
} from "@intelligo-dev/core/db/schema";
import { eq, and, gt, gte, lt } from "drizzle-orm";
import type { TrialCredit } from "@intelligo-dev/core/db/schema";
import { sendTrialExpiryEmail } from "@intelligo-dev/core/email";
import { getBillingSettings } from "./billing-settings";
import {
  getWorkspaceSubscription,
  ensureFreeSubscription,
  subscriptionEntitles,
} from "./queries";
import { getTrialConfig, type TrialStatus } from "./trial-types";
import { normalizeEmailForAbuseCheck, checkTrialAbuse } from "./trial-abuse";
import { deductTrialCredits } from "./trial-deduction";

// Re-export config accessor and types
export { getTrialConfig, NO_TRIAL } from "./trial-types";
export type { TrialConfig } from "./trial-types";
export type { TrialStatus };

// Re-export helpers
export { normalizeEmailForAbuseCheck };
export { deductTrialCredits };

// ---------------------------------------------------------------------------
// provisionTrialCredits
// ---------------------------------------------------------------------------

/**
 * Provision the registered trial grant for a new workspace. Uses
 * onConflictDoNothing so a second call is a no-op; returns the trial
 * record, or null if already provisioned or no trial is registered.
 */
export async function provisionTrialCredits(params: {
  workspaceId: string;
  email: string;
  ipAddress?: string;
}): Promise<TrialCredit | null> {
  const config = getTrialConfig();

  // No registered grant means this deployment offers no trial. Writing
  // a zero-credit row that expires today would only make the UI say a
  // trial had already run out.
  if (config.durationDays <= 0 || !config.grant) return null;

  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + config.durationDays);

  // Refuse a grant in a currency the deployment does not bill in rather
  // than crediting an amount of something else — the same rule the
  // credit-pack webhook enforces.
  const grant = config.grant;
  const settings = await getBillingSettings();
  if (grant.currency !== settings.currency) {
    throw new Error(
      `Trial grant is ${grant.currency}, but this deployment bills in ${settings.currency}`
    );
  }
  const grantMicros = grant.amount;

  const result = await db
    .insert(trialCredits)
    .values({
      id: `trial_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      workspaceId: params.workspaceId,
      initialCredits: config.initialCredits,
      creditsRemaining: config.initialCredits,
      creditsUsed: 0,
      initialMicros: grantMicros,
      remainingMicros: grantMicros,
      usedMicros: 0,
      currency: grant.currency,
      status: "active",
      trialEndDate,
      createdByEmail: params.email,
      normalizedEmail: normalizeEmailForAbuseCheck(params.email),
      createdByIp: params.ipAddress ?? null,
    })
    .onConflictDoNothing({ target: trialCredits.workspaceId })
    .returning();

  return result[0] ?? null;
}

// ---------------------------------------------------------------------------
// getTrialStatus
// ---------------------------------------------------------------------------

/**
 * Get the trial status for a workspace.
 *
 * Returns full trial state including remaining credits, percentage,
 * and whether the warning threshold has been triggered.
 * If no trial record exists, returns a "none" status with zeros.
 */
export async function getTrialStatus(
  workspaceId: string
): Promise<TrialStatus> {
  const rows = await db
    .select()
    .from(trialCredits)
    .where(eq(trialCredits.workspaceId, workspaceId))
    .limit(1);

  if (rows.length === 0 || !rows[0]) {
    return {
      hasTrialCredits: false,
      status: "none",
      creditsRemaining: 0,
      creditsUsed: 0,
      initialCredits: 0,
      percentageRemaining: 0,
      warningTriggered: false,
      trialEndDate: null,
      daysRemaining: 0,
      isExpired: false,
    };
  }

  const trial = rows[0];
  const percentageRemaining =
    trial.initialCredits > 0
      ? trial.creditsRemaining / trial.initialCredits
      : 0;

  const trialEndDate = trial.trialEndDate;
  const now = new Date();
  const daysRemaining = trialEndDate
    ? Math.max(
        0,
        Math.ceil(
          (trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        )
      )
    : 0;
  const isExpired = trialEndDate ? now >= trialEndDate : false;

  const effectiveStatus =
    isExpired && trial.status === "active"
      ? "expired"
      : (trial.status as "active" | "depleted" | "converted" | "expired");

  return {
    hasTrialCredits: true,
    status: effectiveStatus,
    creditsRemaining: trial.creditsRemaining,
    creditsUsed: trial.creditsUsed,
    initialCredits: trial.initialCredits,
    percentageRemaining: Math.round(percentageRemaining * 100),
    warningTriggered: percentageRemaining <= getTrialConfig().warningThreshold,
    trialEndDate: trialEndDate ?? null,
    daysRemaining,
    isExpired,
  };
}

// ---------------------------------------------------------------------------
// getActiveTrialGrant
// ---------------------------------------------------------------------------

/**
 * What is left of the trial grant, for the quota engine's decision
 * about whether trial fallback is available.
 */
export async function getActiveTrialGrant(workspaceId: string): Promise<{
  active: boolean;
  remainingMicros: number;
  currency: string | null;
}> {
  const rows = await db
    .select({
      remainingMicros: trialCredits.remainingMicros,
      currency: trialCredits.currency,
      status: trialCredits.status,
      trialEndDate: trialCredits.trialEndDate,
    })
    .from(trialCredits)
    .where(
      and(
        eq(trialCredits.workspaceId, workspaceId),
        eq(trialCredits.status, "active"),
        gt(trialCredits.remainingMicros, 0)
      )
    )
    .limit(1);

  const none = {
    active: false,
    remainingMicros: 0,
    currency: null,
  };

  if (rows.length === 0 || !rows[0]) return none;
  if (rows[0].trialEndDate && rows[0].trialEndDate < new Date()) return none;

  return {
    active: true,
    remainingMicros: rows[0].remainingMicros,
    currency: rows[0].currency,
  };
}

// ---------------------------------------------------------------------------
// convertTrialToPaid
// ---------------------------------------------------------------------------

/**
 * Convert trial to paid status when workspace subscribes.
 *
 * Only changes the trial record status to "converted" with a timestamp.
 * All workspace data is preserved -- no deletion occurs.
 * Called when a workspace upgrades from free to a paid plan.
 */
export async function convertTrialToPaid(workspaceId: string): Promise<void> {
  await db
    .update(trialCredits)
    .set({
      status: "converted",
      convertedAt: new Date(),
    })
    .where(
      and(
        eq(trialCredits.workspaceId, workspaceId),
        eq(trialCredits.status, "active")
      )
    );
}

// ---------------------------------------------------------------------------
// checkTrialAbuse
// ---------------------------------------------------------------------------

// Re-exports from trial-abuse
export { checkTrialAbuse };

// ---------------------------------------------------------------------------
// hasActiveTrial
// ---------------------------------------------------------------------------

/**
 * Check if workspace has active trial (both credit and time-based).
 * Returns true if trial credits are active AND trial hasn't expired.
 * Used by plan resolution to put the workspace on the registered trial
 * plan (`TrialConfig.planSlug`) while the trial runs.
 */
export async function hasActiveTrial(workspaceId: string): Promise<boolean> {
  const status = await getTrialStatus(workspaceId);
  return (
    status.status === "active" && !status.isExpired && status.daysRemaining > 0
  );
}

// ---------------------------------------------------------------------------
// Helper: Look up workspace owner for email notifications
// ---------------------------------------------------------------------------

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
// processTrialExpirations
// ---------------------------------------------------------------------------

/**
 * Process trial expirations and reminders.
 *
 * Called by daily cron job. Performs two operations:
 * 1. Send reminder emails for trials expiring in the registered
 *    grant's `reminderDaysBeforeExpiry` days
 * 2. Expire trials that have passed their trialEndDate
 *
 * Returns a summary of actions taken for logging.
 */
export async function processTrialExpirations(): Promise<{
  remindersSent: number;
  expired: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let remindersSent = 0;
  let expiredCount = 0;

  const now = new Date();

  // The reminder day is a UTC day, so hosts in different time zones
  // remind the same trials.
  const reminderDayStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + getTrialConfig().reminderDaysBeforeExpiry
    )
  );
  const reminderDayEnd = new Date(
    reminderDayStart.getTime() + 24 * 60 * 60 * 1000
  );

  const trialsNeedingReminder = await db
    .select()
    .from(trialCredits)
    .where(
      and(
        eq(trialCredits.status, "active"),
        gte(trialCredits.trialEndDate, reminderDayStart),
        lt(trialCredits.trialEndDate, reminderDayEnd)
      )
    );

  for (const trial of trialsNeedingReminder) {
    try {
      const result = await db
        .insert(notificationHistory)
        .values({
          id: crypto.randomUUID(),
          workspaceId: trial.workspaceId,
          type: "trial_expiry_reminder",
          periodKey: "trial",
          channel: "email",
          metadata: JSON.stringify({
            daysRemaining: getTrialConfig().reminderDaysBeforeExpiry,
          }),
        })
        .onConflictDoNothing();

      if (result.rowCount && result.rowCount > 0) {
        const owner = await getWorkspaceOwner(trial.workspaceId);
        if (owner && trial.trialEndDate) {
          const expiryDate = trial.trialEndDate.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });

          const upgradeUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings/billing`;

          await sendTrialExpiryEmail({
            to: owner.email,
            workspaceName: owner.workspaceName,
            expiryDate,
            daysRemaining: getTrialConfig().reminderDaysBeforeExpiry,
            upgradeUrl,
          });

          remindersSent++;
        }
      }
    } catch (error) {
      const errorMsg = `Failed to send reminder for workspace ${trial.workspaceId}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      console.error(`[Trial Expiry] ${errorMsg}`);
    }
  }

  const expiredTrials = await db
    .select()
    .from(trialCredits)
    .where(
      and(eq(trialCredits.status, "active"), lt(trialCredits.trialEndDate, now))
    );

  for (const trial of expiredTrials) {
    try {
      await db
        .update(trialCredits)
        .set({
          status: "expired",
          depletedAt: now,
        })
        .where(eq(trialCredits.id, trial.id));

      const sub = await getWorkspaceSubscription(trial.workspaceId);
      if (
        sub &&
        sub.plan?.slug !== "free" &&
        subscriptionEntitles(sub.subscription.status)
      ) {
        continue; // Paid workspaces: skip expiry email (already upgraded)
      }

      await ensureFreeSubscription(trial.workspaceId);

      const owner = await getWorkspaceOwner(trial.workspaceId);
      if (owner && trial.trialEndDate) {
        const expiryDate = trial.trialEndDate.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        const upgradeUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings/billing`;

        await sendTrialExpiryEmail({
          to: owner.email,
          workspaceName: owner.workspaceName,
          expiryDate,
          daysRemaining: 0,
          upgradeUrl,
        });
      }

      expiredCount++;
    } catch (error) {
      const errorMsg = `Failed to expire trial for workspace ${trial.workspaceId}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      console.error(`[Trial Expiry] ${errorMsg}`);
    }
  }

  return {
    remindersSent,
    expired: expiredCount,
    errors,
  };
}
