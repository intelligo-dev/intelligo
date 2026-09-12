/**
 * Trial banner config — consumer-owned.
 *
 * `hideOnPaths`: locale-less route prefixes where the banner never
 * renders (matched against `@/i18n/navigation`'s `usePathname`, exact
 * or as a path-segment prefix). The default keeps it off the chat
 * surface — a persistent strip over a conversation is where a banner
 * costs the most. Empty the list to show it everywhere.
 *
 * `upgradeHref`: where the CTA sends the user.
 */

export interface TrialBannerConfig {
  hideOnPaths: string[];
  upgradeHref: string;
}

export const trialBannerConfig: TrialBannerConfig = {
  hideOnPaths: ["/chat"],
  upgradeHref: "/pricing",
};
