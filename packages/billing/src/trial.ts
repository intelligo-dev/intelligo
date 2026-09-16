/**
 * Trial Credits System
 *
 * Manages trial credit provisioning, status tracking, deduction, and conversion.
 * Each new workspace receives 100K trial tokens to reduce signup friction.
 *
 * Functions:
 * - provisionTrialCredits: Grant 100K tokens to new workspace (idempotent)
 * - getTrialStatus: Query trial state with remaining/used/percentage
 * - deductTrialCredits: Atomically decrement trial balance
 * - convertTrialToPaid: Mark trial as converted when workspace upgrades
 * - checkTrialAbuse: Limit trials per email (3) and per IP (5)
 *
 * Trial credits are separate from purchased credits (credit_balances).
 * They act as a fallback when plan quota is exceeded or credit balance is zero.
 *
 * Pattern: Server-side only, called by quota engine and workspace creation flow.
 */

import { db } from "@intelligo-dev/core/db";
import {
  trialCredits,
  notificationHistory,
  organization,
  users,
  member,
} from "@intelligo-dev/core/db/schema";
import { eq, and, gt, gte, lt, or } from "drizzle-orm";
import type { TrialCredit } from "@intelligo-dev/core/db/schema";
import { sendTrialExpiryEmail } from "@intelligo-dev/core/email";
import { getBillingSettings } from "./billing-settings";
import { getWorkspaceSubscription, ensureFreeSubscription } from "./queries";
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

/** Micros are millionths of one major unit; whole units × this. */
const MICROS_PER_UNIT = 1_000_000;

// ---------------------------------------------------------------------------
// provisionTrialCredits (TRIAL-01)
// ---------------------------------------------------------------------------

/**
 * Provision trial credits for a new workspace.
 *
 * Inserts a trial_credits row with 100K tokens. Uses onConflictDoNothing
 * so a second call is a no-op (idempotent). Returns the trial record,
 * or null if already provisioned.
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
  if (config.durationDays <= 0) return null;

  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + config.durationDays);

  // The grant is denominated in whatever the deployment bills in; the
  // config states it in whole units of that currency.
  const settings = await getBillingSettings();
  const grantMicros = config.initialCreditsMnt * MICROS_PER_UNIT;

  const result = await db
    .insert(trialCredits)
    .values({
      id: `trial_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      workspaceId: params.workspaceId,
      initialCredits: config.initialCredits,
      creditsRemaining: config.initialCredits,
      creditsUsed: 0,
      initialCreditsMnt: config.initialCreditsMnt,
      creditsRemainingMnt: config.initialCreditsMnt,
      creditsUsedMnt: 0,
      initialMicros: grantMicros,
      remainingMicros: grantMicros,
      usedMicros: 0,
      currency: settings.currency,
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
// getTrialStatus (TRIAL-03)
// ---------------------------------------------------------------------------

/**
 * Get the trial status for a workspace.
 *
 * Returns full trial state including remaining credits, percentage,
 * and whether the warning threshold has been triggered (TRIAL-04).
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
// hasActiveTrialMnt (TRIAL-05)
// ---------------------------------------------------------------------------

/**
 * Check trial activity in MNT terms — used by the cost-based quota
 * engine to decide whether trial fallback is available.
 */
export async function hasActiveTrialMnt(workspaceId: string): Promise<{
  active: boolean;
  remainingMnt: number;
  remainingMicros: number;
  currency: string | null;
}> {
  const rows = await db
    .select({
      creditsRemainingMnt: trialCredits.creditsRemainingMnt,
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
        // Either column may be the live one: a grant written before
        // 0044 has only whole tugrik, and one written in a currency
        // whose whole-unit column was never filled has only micros.
        or(
          gt(trialCredits.creditsRemainingMnt, 0),
          gt(trialCredits.remainingMicros, 0)
        )
      )
    )
    .limit(1);

  const none = {
    active: false,
    remainingMnt: 0,
    remainingMicros: 0,
    currency: null,
  };

  if (rows.length === 0 || !rows[0]) return none;
  if (rows[0].trialEndDate && rows[0].trialEndDate < new Date()) return none;

  return {
    active: true,
    remainingMnt: rows[0].creditsRemainingMnt,
    remainingMicros: rows[0].remainingMicros,
    currency: rows[0].currency,
  };
}

// ---------------------------------------------------------------------------
// convertTrialToPaid (TRIAL-06)
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
// checkTrialAbuse (TRIAL-07)
// ---------------------------------------------------------------------------

// Re-exports from trial-abuse
export { checkTrialAbuse };

// ---------------------------------------------------------------------------
// hasActiveTrial (TRIAL-08)
// ---------------------------------------------------------------------------

/**
 * Check if workspace has active trial (both credit and time-based).
 * Returns true if trial credits are active AND trial hasn't expired.
 * Used by feature flag checks and quota enforcement to grant Pro access during trial.
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
// processTrialExpirations (TRIAL-09)
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

  const reminderDate = new Date();
  reminderDate.setDate(
    reminderDate.getDate() + getTrialConfig().reminderDaysBeforeExpiry
  );
  const reminderDayStart = new Date(
    reminderDate.getFullYear(),
    reminderDate.getMonth(),
    reminderDate.getDate()
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
      if (sub && sub.plan?.slug !== "free") {
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
