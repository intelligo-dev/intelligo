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
 * The credit counts are formatted here, on the server, and reach the
 * client as strings: compact notation ("1.2K") is spelled by the ICU
 * data of whichever runtime formats it, and Node's and a browser's
 * differ for many locales — formatting on both sides would render one
 * string on the server and another at hydration.
 *
 * Route suppression (e.g. keeping the banner out of the chat surface)
 * is client-side in `TrialBanner` via `trialBannerConfig.hideOnPaths` —
 * a Server Component outside the `[locale]` segment has no reliable
 * pathname to branch on.
 */

import { getWorkspaceContext } from "@intelligo-dev/auth";
import { getTrialStatus } from "@intelligo-dev/billing";
import { createLogger } from "@intelligo-dev/core/logger";
import { getFormatter } from "next-intl/server";

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

    const format = await getFormatter();
    const compact = (value: number) =>
      format.number(value, { notation: "compact", maximumFractionDigits: 1 });

    return (
      <TrialBanner
        daysRemaining={trial.daysRemaining}
        creditsRemaining={compact(trial.creditsRemaining)}
        initialCredits={compact(trial.initialCredits)}
      />
    );
  } catch (error) {
    log.error("Failed to fetch trial status", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
