/**
 * Typed wrappers that render a React Email template and send it. They never
 * throw; each returns a SendEmailResult.
 *
 * Every sender attaches a stable `template` key and flat variables so
 * template-based providers (Loops) can send the same email; HTML providers
 * ignore it. Boolean variants use distinct keys (quota-warning /
 * quota-exceeded, trial-warning / trial-depleted) because template providers
 * branch per template, not per variable.
 */

import * as React from "react";
import { sendEmail, type SendEmailResult } from "./send";
import { formatMoney, type Money } from "../money";
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

/** The locale the email copy is written in; amounts are formatted to match. */
const EMAIL_LOCALE = "en";

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

/**
 * Send the allowance warning or used-up email. `used` and `allowance`
 * are money in the deployment's billing currency; the template and the
 * provider variables receive them formatted.
 */
export async function sendQuotaWarningEmail(params: {
  to: string;
  workspaceName: string;
  percentageUsed: number;
  used: Money;
  allowance: Money;
  upgradeUrl: string;
  isExceeded: boolean;
}): Promise<SendEmailResult> {
  const used = formatMoney(params.used, EMAIL_LOCALE);
  const allowance = formatMoney(params.allowance, EMAIL_LOCALE);

  return sendEmail({
    to: params.to,
    subject: params.isExceeded
      ? "Monthly allowance used up"
      : `Monthly allowance at ${params.percentageUsed}%`,
    react: React.createElement(QuotaWarningEmail, {
      workspaceName: params.workspaceName,
      percentageUsed: params.percentageUsed,
      used,
      allowance,
      upgradeUrl: params.upgradeUrl,
      isExceeded: params.isExceeded,
    }),
    template: {
      key: params.isExceeded ? "quota-exceeded" : "quota-warning",
      variables: {
        workspaceName: params.workspaceName,
        percentageUsed: params.percentageUsed,
        used,
        allowance,
        currency: params.allowance.currency,
        upgradeUrl: params.upgradeUrl,
      },
    },
  });
}

/** Send trial warning or depleted email. */
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
