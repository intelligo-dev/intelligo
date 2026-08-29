/**
 * Notification Type Definitions (NOTIF-07)
 *
 * Types covering all notification events:
 * - Quota/usage warnings (80%, 100%)
 * - Trial credit alerts (20% remaining, depleted)
 * - Payment events (failed, confirmed)
 * - Team events (member joined, invitation)
 */

export type NotificationType =
  | "quota_warning_80"
  | "quota_warning_100"
  | "trial_warning_20"
  | "trial_depleted"
  | "payment_failed"
  | "team_member_joined"
  | "subscription_confirmed"
  | "workspace_invitation"
  | "referral_signup"
  | "referral_upgrade";

export interface CreateNotificationParams {
  userId: string;
  workspaceId?: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}
