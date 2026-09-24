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
