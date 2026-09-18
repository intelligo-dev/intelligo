/**
 * Each trigger creates an in-app notification (awaited) and sends an email
 * (fire-and-forget, errors logged). Deduplication is the caller's job.
 */

import { createNotification } from "./index";
import {
  sendQuotaWarningEmail,
  sendTrialWarningEmail,
  sendPaymentFailedEmail,
} from "../email/senders";

export async function triggerQuotaNotification(params: {
  userId: string;
  userEmail: string;
  workspaceId: string;
  workspaceName: string;
  percentageUsed: number;
  tokensUsed: number;
  tokensLimit: number;
  isExceeded: boolean;
}): Promise<void> {
  const upgradeUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings/billing`;

  await createNotification({
    userId: params.userId,
    workspaceId: params.workspaceId,
    type: params.isExceeded ? "quota_warning_100" : "quota_warning_80",
    title: params.isExceeded ? "Quota Exceeded" : "Quota Warning",
    message: params.isExceeded
      ? `Your workspace "${params.workspaceName}" has used all ${params.tokensLimit.toLocaleString()} tokens this month. Upgrade your plan for more tokens.`
      : `Your workspace "${params.workspaceName}" has used ${params.percentageUsed}% of its monthly token quota.`,
    metadata: {
      workspaceName: params.workspaceName,
      percentageUsed: params.percentageUsed,
      tokensUsed: params.tokensUsed,
      tokensLimit: params.tokensLimit,
    },
  });

  sendQuotaWarningEmail({
    to: params.userEmail,
    workspaceName: params.workspaceName,
    percentageUsed: params.percentageUsed,
    tokensUsed: params.tokensUsed,
    tokensLimit: params.tokensLimit,
    upgradeUrl,
    isExceeded: params.isExceeded,
  }).catch((err) =>
    console.error("[Email] Failed to send quota warning:", err)
  );
}

export async function triggerTrialNotification(params: {
  userId: string;
  userEmail: string;
  workspaceId: string;
  workspaceName: string;
  creditsRemaining: number;
  totalCredits: number;
  percentageRemaining: number;
  isDepleted: boolean;
}): Promise<void> {
  const upgradeUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings/billing`;

  await createNotification({
    userId: params.userId,
    workspaceId: params.workspaceId,
    type: params.isDepleted ? "trial_depleted" : "trial_warning_20",
    title: params.isDepleted
      ? "Trial Credits Depleted"
      : "Trial Credits Running Low",
    message: params.isDepleted
      ? `Your workspace "${params.workspaceName}" has used all trial credits. Subscribe to a plan to continue using AI features.`
      : `Your workspace "${params.workspaceName}" has ${params.creditsRemaining.toLocaleString()} of ${params.totalCredits.toLocaleString()} trial credits remaining (${params.percentageRemaining}%).`,
    metadata: {
      workspaceName: params.workspaceName,
      creditsRemaining: params.creditsRemaining,
      totalCredits: params.totalCredits,
      percentageRemaining: params.percentageRemaining,
    },
  });

  sendTrialWarningEmail({
    to: params.userEmail,
    workspaceName: params.workspaceName,
    creditsRemaining: params.creditsRemaining,
    totalCredits: params.totalCredits,
    percentageRemaining: params.percentageRemaining,
    upgradeUrl,
    isDepleted: params.isDepleted,
  }).catch((err) =>
    console.error("[Email] Failed to send trial warning:", err)
  );
}

export async function triggerPaymentFailedNotification(params: {
  userId: string;
  userEmail: string;
  workspaceId: string;
  workspaceName: string;
  amount: string;
}): Promise<void> {
  const updatePaymentUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/settings/billing`;

  await createNotification({
    userId: params.userId,
    workspaceId: params.workspaceId,
    type: "payment_failed",
    title: "Payment Failed",
    message: `Payment of ${params.amount} failed for ${params.workspaceName}. Update your payment method.`,
    metadata: {
      workspaceName: params.workspaceName,
      amount: params.amount,
    },
  });

  sendPaymentFailedEmail({
    to: params.userEmail,
    workspaceName: params.workspaceName,
    amount: params.amount,
    updatePaymentUrl,
  }).catch((err) =>
    console.error("[Email] Failed to send payment failed:", err)
  );
}

/** In-app only: this event sends no email. */
export async function triggerTeamMemberJoinedNotification(params: {
  userId: string;
  workspaceId: string;
  memberName: string;
  memberEmail: string;
}): Promise<void> {
  await createNotification({
    userId: params.userId,
    workspaceId: params.workspaceId,
    type: "team_member_joined",
    title: "New Team Member",
    message: `${params.memberName} (${params.memberEmail}) joined the workspace.`,
    metadata: {
      memberName: params.memberName,
      memberEmail: params.memberEmail,
    },
  });
}
