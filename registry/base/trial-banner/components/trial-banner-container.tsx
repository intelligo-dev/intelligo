/**
 * Trial banner container — the intended `bannerTop` binding for the
 * app-shell's `ShellConfig` seam (`@/lib/shell-config`).
 *
 * `shellConfig.bannerTop` is rendered with no props (inside
 * `SidebarInset`, above `main`), so this wrapper resolves the active
 * workspace, fetches its trial status, and decides whether the client
 * `TrialBanner` renders at all. An async Server Component is a valid
 * `bannerTop` binding — React 19's `FunctionComponent` allows
 * `Promise<ReactNode>` — so the fetch happens server-side rather than
 * through a client round trip.
 *
 * A trial that isn't active (none, converted, depleted, expired)
 * renders nothing; so does a fetch failure — a broken banner lookup
 * must never take the shell down with it.
 *
 * Route suppression (e.g. keeping the banner out of the chat surface)
 * is client-side in `TrialBanner` via `trialBannerConfig.hideOnPaths` —
 * a Server Component outside the `[locale]` segment has no reliable
 * pathname to branch on.
 */

import { getWorkspaceContext } from "@intelligo/auth";
import { getTrialStatus } from "@intelligo/billing";
import { createLogger } from "@intelligo/core/logger";

import { TrialBanner } from "./trial-banner";

const log = createLogger("TrialBannerContainer");

export async function TrialBannerContainer() {
  const workspace = await getWorkspaceContext();
  if (!workspace?.workspace?.id) return null;

  try {
    const trial = await getTrialStatus(workspace.workspace.id);
    if (
      trial.status !== "active" ||
      trial.isExpired ||
      trial.daysRemaining <= 0
    ) {
      return null;
    }

    return (
      <TrialBanner
        daysRemaining={trial.daysRemaining}
        creditsRemaining={trial.creditsRemaining}
        initialCredits={trial.initialCredits}
      />
    );
  } catch (error) {
    log.error("Failed to fetch trial status", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
