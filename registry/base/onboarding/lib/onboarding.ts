import "server-only";

/**
 * Onboarding service binding — the composition-root wiring for the
 * onboarding item. The framework-owned onboarding service
 * (`@intelligo/auth`) takes no ports: unlike `team-settings`'s
 * `lib/team.ts`, there is nothing to bind here. `complete()`/`skip()`
 * deliberately do not provision trial credits or referral bonuses —
 * that first-workspace bootstrapping belongs to the `app-shell` item's
 * `lib/workspace-bootstrap.ts`, which already runs exactly once per
 * new workspace (see `createOnboardingService`'s doc comment in
 * `@intelligo/auth` for the full reasoning).
 */

import { createOnboardingService } from "@intelligo/auth";

export const onboarding = createOnboardingService();
