import "server-only";

/**
 * The onboarding service; it takes no ports. `complete()` and `skip()`
 * provision nothing: first-workspace provisioning belongs in
 * `lib/workspace-bootstrap.ts`.
 */

import { createOnboardingService } from "@intelligo-dev/auth";

export const onboarding = createOnboardingService();
