import "server-only";

/**
 * Workspace bootstrap — composition-root binding for the app shell's one
 * extension point: what happens the first time `ensureUserWorkspace`
 * (`@intelligo-dev/auth`) has to create a workspace for a user, instead of
 * finding an existing one.
 *
 * `@intelligo-dev/auth` must not import `@intelligo-dev/billing` — a product's
 * trial/referral/welcome-bonus rules are a business decision, not a
 * framework one, and importing them directly would recreate the very
 * auth → billing cycle `ensureUserWorkspace`'s callback parameter exists
 * to avoid. So the layout injects this callback instead of the package
 * importing anything. Per ADR-0005, that binding happens here, in a file
 * the composition root owns and calls explicitly — never as an import
 * side effect.
 *
 * Ships provisioning nothing: a fresh install has no trial or referral
 * program to wire up. Bind whatever your product actually wants to
 * happen on first workspace creation — the commented example below
 * shows the shape once `@intelligo-dev/billing` is installed.
 */
export async function onWorkspaceCreated(_params: {
  workspaceId: string;
  email: string;
}): Promise<void> {
  // Provisions nothing by default.
}

// Example — grant trial credits on first workspace creation once
// `@intelligo-dev/billing` is installed (uncomment and adjust; remove the
// no-op export above):
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
