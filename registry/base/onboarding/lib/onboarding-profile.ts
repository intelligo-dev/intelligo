import "server-only";

/**
 * Profile service instance for onboarding's own persistence.
 *
 * Its own binding rather than the `profile-settings` item's
 * `lib/profile.ts`: the only method used here is `updateProfile`,
 * which takes no ports, so onboarding does not have to depend on that
 * item being installed just to save a display name. If you install
 * both and want one instance, re-export it from here.
 */

import { createProfileService } from "@intelligo/auth";

export const profile = createProfileService();
