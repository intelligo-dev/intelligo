/**
 * Feature-gating configuration — consumer-owned.
 *
 * `upgradeHref`: where every gating surface sends the user. Defaults
 * to the billing settings page (the `billing-settings` item's route),
 * which is where a plan change actually happens; point it at
 * `/pricing` if your product prefers the comparison first.
 *
 * `warnAtPercent` / `urgentAtPercent`: when `QuotaWarning` starts
 * showing, and when it escalates. Below the first, it renders nothing —
 * a user who is fine should not be told about a limit.
 */

export interface FeatureGatingConfig {
  upgradeHref: string;
  warnAtPercent: number;
  urgentAtPercent: number;
}

export const featureGatingConfig: FeatureGatingConfig = {
  upgradeHref: "/settings/billing",
  warnAtPercent: 80,
  urgentAtPercent: 95,
};
