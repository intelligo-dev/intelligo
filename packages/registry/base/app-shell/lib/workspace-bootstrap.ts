import "server-only";

/**
 * Runs once, when `ensureUserWorkspace` creates a user's first workspace:
 * the place for trial credits, referral bonuses or any other one-time
 * provisioning. It lives here so `@intelligo-dev/auth` never imports
 * billing.
 */
export async function onWorkspaceCreated(_params: {
  workspaceId: string;
  email: string;
}): Promise<void> {
  // Provisions nothing by default.
}

// Example: grant trial credits with `@intelligo-dev/billing` (replace the
// export above):
//
// import { provisionTrialCredits } from "@intelligo-dev/billing";
//
// export async function onWorkspaceCreated({
//   workspaceId,
//   email,
// }: {
//   workspaceId: string;
//   email: string;
// }): Promise<void> {
//   await provisionTrialCredits({ workspaceId, email, ipAddress: undefined });
// }
