/**
 * Email Sender Functions
 *
 * High-level convenience wrappers that compose sendEmail() with React Email
 * templates. Each function accepts typed params and returns SendEmailResult.
 *
 * These are the primary API for sending branded emails throughout the app:
 * - Auth emails: welcome, verify, password reset (wired into Better-Auth)
 * - Team emails: workspace invitation (replaces Phase 10 console.log)
 * - Billing emails: quota warning, trial warning, payment failed, subscription confirmed
 *
 * All functions return Promise<SendEmailResult> and NEVER throw (TECH-08).
 *
 * Every sender attaches a stable `template` key + flat variables so
 * template-based providers (Loops) can send the same email from a
 * provider-side template. HTML-capable providers (Resend) ignore it.
 * Loops mapping: LOOPS_TRANSACTIONAL_ID_<KEY> (e.g. "verify-email" →
 * LOOPS_TRANSACTIONAL_ID_VERIFY_EMAIL). Boolean variants use distinct keys
 * (quota-warning / quota-exceeded, trial-warning / trial-depleted) because
 * template providers branch per template, not per variable.
 */

import * as React from "react";
import { sendEmail, type SendEmailResult } from "./send";
import {
  WelcomeEmail,
  VerifyEmailEmail,
  PasswordResetEmail,
  WorkspaceInvitationEmail,
  QuotaWarningEmail,
  TrialWarningEmail,
  TrialExpiryEmail,
  PaymentFailedEmail,
  SubscriptionConfirmedEmail,
} from "./templates";

// ---------------------------------------------------------------------------
// Auth Emails
// ---------------------------------------------------------------------------

/** Send welcome email after signup (EMAIL-03) */
export async function sendWelcomeEmail(params: {
  to: string;
  userName: string;
  dashboardUrl: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: params.to,
    subject: "Welcome to Intelligo!",
    react: React.createElement(WelcomeEmail, {
      userName: params.userName,
      dashboardUrl: params.dashboardUrl,
    }),
    template: {
      key: "welcome",
      variables: {
        userName: params.userName,
        dashboardUrl: params.dashboardUrl,
      },
    },
  });
}

/** Send email verification link (EMAIL-04) */
export async function sendVerifyEmail(params: {
  to: string;
  userName: string;
  verificationUrl: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: params.to,
    subject: "Verify your email address",
    react: React.createElement(VerifyEmailEmail, {
      userName: params.userName,
      verificationUrl: params.verificationUrl,
    }),
    template: {
      key: "verify-email",
      variables: {
        userName: params.userName,
        verificationUrl: params.verificationUrl,
      },
    },
  });
}

/** Send password reset link (EMAIL-05) */
export async function sendPasswordResetEmail(params: {
  to: string;
  userName: string;
  resetUrl: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: params.to,
    subject: "Reset your password",
    react: React.createElement(PasswordResetEmail, {
      userName: params.userName,
      resetUrl: params.resetUrl,
    }),
    template: {
      key: "password-reset",
      variables: {
        userName: params.userName,
        resetUrl: params.resetUrl,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Team Emails
// ---------------------------------------------------------------------------

/** Send workspace invitation email (EMAIL-06) */
export async function sendInvitationEmail(params: {
  to: string;
  inviterName: string;
  workspaceName: string;
  role: string;
  acceptUrl: string;
  declineUrl: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: params.to,
    subject: `${params.inviterName} invited you to ${params.workspaceName}`,
    react: React.createElement(WorkspaceInvitationEmail, {
      inviterName: params.inviterName,
      workspaceName: params.workspaceName,
      role: params.role,
      acceptUrl: params.acceptUrl,
      declineUrl: params.declineUrl,
    }),
    template: {
      key: "workspace-invitation",
      variables: {
        inviterName: params.inviterName,
        workspaceName: params.workspaceName,
        role: params.role,
        acceptUrl: params.acceptUrl,
        declineUrl: params.declineUrl,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Billing / Usage Emails
// ---------------------------------------------------------------------------

/** Send quota warning or exceeded email (EMAIL-09 / EMAIL-10) */
export async function sendQuotaWarningEmail(params: {
  to: string;
  workspaceName: string;
  percentageUsed: number;
  tokensUsed: number;
  tokensLimit: number;
  upgradeUrl: string;
  isExceeded: boolean;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: params.to,
    subject: params.isExceeded
      ? "Token quota exceeded"
      : `Token quota at ${params.percentageUsed}%`,
    react: React.createElement(QuotaWarningEmail, {
      workspaceName: params.workspaceName,
      percentageUsed: params.percentageUsed,
      tokensUsed: params.tokensUsed,
      tokensLimit: params.tokensLimit,
      upgradeUrl: params.upgradeUrl,
      isExceeded: params.isExceeded,
    }),
    template: {
      key: params.isExceeded ? "quota-exceeded" : "quota-warning",
      variables: {
        workspaceName: params.workspaceName,
        percentageUsed: params.percentageUsed,
        tokensUsed: params.tokensUsed,
        tokensLimit: params.tokensLimit,
        upgradeUrl: params.upgradeUrl,
      },
    },
  });
}

/** Send trial warning or depleted email (EMAIL-07 / EMAIL-08) */
export async function sendTrialWarningEmail(params: {
  to: string;
  workspaceName: string;
  creditsRemaining: number;
  totalCredits: number;
  percentageRemaining: number;
  upgradeUrl: string;
  isDepleted: boolean;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: params.to,
    subject: params.isDepleted
      ? "Trial credits depleted"
      : "Trial credits running low",
    react: React.createElement(TrialWarningEmail, {
      workspaceName: params.workspaceName,
      creditsRemaining: params.creditsRemaining,
      totalCredits: params.totalCredits,
      percentageRemaining: params.percentageRemaining,
      upgradeUrl: params.upgradeUrl,
      isDepleted: params.isDepleted,
    }),
    template: {
      key: params.isDepleted ? "trial-depleted" : "trial-warning",
      variables: {
        workspaceName: params.workspaceName,
        creditsRemaining: params.creditsRemaining,
        totalCredits: params.totalCredits,
        percentageRemaining: params.percentageRemaining,
        upgradeUrl: params.upgradeUrl,
      },
    },
  });
}

/** Send payment failed email (EMAIL-11) */
export async function sendPaymentFailedEmail(params: {
  to: string;
  workspaceName: string;
  amount: string;
  updatePaymentUrl: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: params.to,
    subject: `Payment failed for ${params.workspaceName}`,
    react: React.createElement(PaymentFailedEmail, {
      workspaceName: params.workspaceName,
      amount: params.amount,
      updatePaymentUrl: params.updatePaymentUrl,
    }),
    template: {
      key: "payment-failed",
      variables: {
        workspaceName: params.workspaceName,
        amount: params.amount,
        updatePaymentUrl: params.updatePaymentUrl,
      },
    },
  });
}

/** Send subscription confirmed email (EMAIL-12) */
export async function sendSubscriptionConfirmedEmail(params: {
  to: string;
  workspaceName: string;
  planName: string;
  amount: string;
  dashboardUrl: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: params.to,
    subject: `Subscription confirmed - ${params.planName} plan`,
    react: React.createElement(SubscriptionConfirmedEmail, {
      workspaceName: params.workspaceName,
      planName: params.planName,
      amount: params.amount,
      dashboardUrl: params.dashboardUrl,
    }),
    template: {
      key: "subscription-confirmed",
      variables: {
        workspaceName: params.workspaceName,
        planName: params.planName,
        amount: params.amount,
        dashboardUrl: params.dashboardUrl,
      },
    },
  });
}

/** Send trial expiry reminder email (EMAIL-13) */
export async function sendTrialExpiryEmail(params: {
  to: string;
  workspaceName: string;
  expiryDate: string;
  daysRemaining: number;
  upgradeUrl: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: params.to,
    subject:
      params.daysRemaining <= 0
        ? `Your Pro trial for ${params.workspaceName} has expired`
        : `Your Pro trial expires in ${params.daysRemaining} day${params.daysRemaining === 1 ? "" : "s"}`,
    react: React.createElement(TrialExpiryEmail, {
      workspaceName: params.workspaceName,
      expiryDate: params.expiryDate,
      daysRemaining: params.daysRemaining,
      upgradeUrl: params.upgradeUrl,
    }),
    template: {
      key: "trial-expiry",
      variables: {
        workspaceName: params.workspaceName,
        expiryDate: params.expiryDate,
        daysRemaining: params.daysRemaining,
        upgradeUrl: params.upgradeUrl,
      },
    },
  });
}
