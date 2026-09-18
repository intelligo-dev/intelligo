import "server-only";

/**
 * A profile service for saving the display name, bound here so
 * onboarding does not depend on the `profile-settings` item.
 * `updateProfile` needs no ports. With both items installed you can
 * re-export one instance.
 */

import { createProfileService } from "@intelligo-dev/auth";

export const profile = createProfileService();
