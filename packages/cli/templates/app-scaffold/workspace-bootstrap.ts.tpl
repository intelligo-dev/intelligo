import "server-only";

import type { WorkspaceCreated } from "@intelligo-dev/auth";

/**
 * Runs once, when a user's personal workspace is created — at signup,
 * or the first time the app finds the user without one: the place for
 * trial credits, referral bonuses or any other one-time provisioning.
 * `lib/intelligo.ts` sets it with `setWorkspaceCreatedHandler`, so
 * `@intelligo-dev/auth` never imports billing.
 *
 * A failure is logged and does not fail the signup.
 */
export async function onWorkspaceCreated(
  _created: WorkspaceCreated
): Promise<void> {
  // Provisions nothing by default.
}

// Example: grant the registered trial with `@intelligo-dev/billing`
// (replace the export above):
//
// import { provisionTrialCredits } from "@intelligo-dev/billing";
//
// export async function onWorkspaceCreated({
//   workspaceId,
//   email,
// }: WorkspaceCreated): Promise<void> {
//   await provisionTrialCredits({ workspaceId, email });
// }
