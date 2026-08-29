/**
 * Referral System Logic
 *
 * "3 найзаа урь → Standard үнэгүй" growth strategy.
 * Uses existing referralCodes + referrals tables from ai.ts schema.
 *
 */

import { db } from "@intelligo-dev/core/db";
import {
  referralCodes,
  referrals,
  plans,
  subscriptions,
  member,
} from "@intelligo-dev/core/db/schema";
import { eq, count } from "drizzle-orm";
import { createNotification } from "@intelligo-dev/core/notifications";

const REQUIRED_REFERRALS = 3;

/**
 * Generate a random 6-character referral code
 */
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Get or create a referral code for a user
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.userId, userId))
    .limit(1);

  if (existing[0]) {
    return existing[0].code;
  }

  const code = generateCode();
  await db.insert(referralCodes).values({
    id: crypto.randomUUID(),
    userId,
    code,
  });

  return code;
}

/**
 * Record a referral signup
 * Returns the referrer's total referral count
 */
export async function recordReferralSignup(params: {
  referralCode: string;
  referredUserId: string;
}): Promise<{ success: boolean; referrerCount: number; referrerId?: string }> {
  // Find referrer by code
  const codeRecord = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.code, params.referralCode))
    .limit(1);

  if (!codeRecord[0]) {
    return { success: false, referrerCount: 0 };
  }

  const referrerId = codeRecord[0].userId;
  const referralCodeId = codeRecord[0].id;

  // Don't allow self-referral
  if (referrerId === params.referredUserId) {
    return { success: false, referrerCount: 0, referrerId };
  }

  // Record signup (unique constraint on referred_user_id)
  try {
    await db.insert(referrals).values({
      id: crypto.randomUUID(),
      referrerId,
      referredUserId: params.referredUserId,
      referralCodeId,
      status: "completed",
      completedAt: new Date(),
    });
  } catch {
    // Unique constraint violation = already referred
    return { success: false, referrerCount: 0, referrerId };
  }

  // Count total referrals
  const result = await db
    .select({ count: count() })
    .from(referrals)
    .where(eq(referrals.referrerId, referrerId));

  const referrerCount = result[0]?.count ?? 0;

  return { success: true, referrerCount, referrerId };
}

/**
 * Check if user has earned Standard upgrade via referrals
 */
export async function hasEarnedReferralUpgrade(
  userId: string
): Promise<boolean> {
  const result = await db
    .select({ count: count() })
    .from(referrals)
    .where(eq(referrals.referrerId, userId));

  return (result[0]?.count ?? 0) >= REQUIRED_REFERRALS;
}

/**
 * Get referral stats for a user (for dashboard)
 */
export async function getReferralStats(userId: string): Promise<{
  code: string;
  referralCount: number;
  requiredCount: number;
  earned: boolean;
}> {
  const code = await getOrCreateReferralCode(userId);

  const result = await db
    .select({ count: count() })
    .from(referrals)
    .where(eq(referrals.referrerId, userId));

  const referralCount = result[0]?.count ?? 0;

  return {
    code,
    referralCount,
    requiredCount: REQUIRED_REFERRALS,
    earned: referralCount >= REQUIRED_REFERRALS,
  };
}

/**
 * Grant Standard plan upgrade to a referrer who earned it (3+ referrals).
 * Finds the referrer's workspace, upgrades subscription to standard,
 * and creates an in-app notification.
 *
 * @param referrerId - The user who referred 3+ friends
 */
export async function grantReferralUpgrade(
  referrerId: string
): Promise<boolean> {
  // Find the referrer's workspace via org membership
  const membership = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, referrerId))
    .limit(1);

  if (!membership[0]) {
    console.error("[Referral] No workspace found for referrer", { referrerId });
    return false;
  }

  const workspaceId = membership[0].organizationId;

  // Find the standard plan
  const standardPlan = await db
    .select()
    .from(plans)
    .where(eq(plans.slug, "standard"))
    .limit(1);

  if (!standardPlan[0]) {
    console.error("[Referral] Standard plan not found in database");
    return false;
  }

  // Upgrade the workspace subscription to standard
  const updated = await db
    .update(subscriptions)
    .set({
      planId: standardPlan[0].id,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.workspaceId, workspaceId))
    .returning();

  if (!updated[0]) {
    console.error("[Referral] No subscription found for workspace", {
      workspaceId,
    });
    return false;
  }

  // Notify the referrer
  await createNotification({
    userId: referrerId,
    workspaceId,
    type: "referral_upgrade",
    title: "Standard нээгдлээ!",
    message: "3 найзаа урьсан — Standard багц үнэгүй нээгдлээ! Баярлалаа 🎉",
  });

  return true;
}
