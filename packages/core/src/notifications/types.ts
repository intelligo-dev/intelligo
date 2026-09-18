export type NotificationType =
  | "quota_warning_80"
  | "quota_warning_100"
  | "trial_warning_20"
  | "trial_depleted"
  | "payment_failed"
  | "team_member_joined"
  | "subscription_confirmed"
  | "workspace_invitation";

export interface CreateNotificationParams {
  userId: string;
  workspaceId?: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}
