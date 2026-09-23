/** The notification types the framework itself creates. */
export type BuiltInNotificationType =
  | "quota_warning_80"
  | "quota_warning_100"
  | "trial_warning_20"
  | "trial_depleted"
  | "payment_failed"
  | "team_member_joined"
  | "subscription_confirmed"
  | "workspace_invitation";

/**
 * A notification's `type`: one of the built-in types, or any string a
 * product defines for its own notifications. `(string & {})` keeps the
 * built-in names offered by autocompletion.
 */
export type NotificationType = BuiltInNotificationType | (string & {});

export interface CreateNotificationParams {
  userId: string;
  workspaceId?: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}
