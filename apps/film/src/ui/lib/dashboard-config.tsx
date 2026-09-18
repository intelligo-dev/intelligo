/**
 * Dashboard configuration — consumer-owned, imported by client
 * components (so, like `nav-config.ts`, it may hold React/Lucide
 * component values that must never cross the RSC boundary as props).
 *
 * The shipped defaults render a complete, honest AI-first home with no
 * editing: a hero from this item's own messages, a composer that opens
 * a new conversation, starter chips that fill it, a resume affordance
 * for unfinished work, and a quiet strip of recent conversations and
 * plan state at the foot. Every part is replaceable here rather than in
 * a component:
 *
 *  - `hero`: icon plus fully-qualified message keys for the title and
 *    subtitle. Point them at your product's namespace to say what this
 *    workspace is actually for.
 *  - `starters`: fully-qualified message keys (the `chatConfig.starters`
 *    contract). Each renders as a chip under the composer that opens a
 *    new conversation prefilled with that text. Empty hides the row.
 *  - `chatBasePath`: where the composer and the starters send the user.
 *    Defaults to the `chat` item's `/chat`; change it if your chat
 *    surface lives elsewhere, and note that the whole composer
 *    affordance only makes sense with a chat surface installed.
 *
 * There are no `shortcuts` or `showPlanSummary` seams. The links the
 * first held (artifacts, usage, team) are all in the shell's
 * navigation, and the billing strip the second hid was spend and plan
 * state on a page nobody opens to read a meter — `/usage` and
 * `/pricing` own that, one click away.
 */

import { Sparkles, type LucideIcon } from "lucide-react";

export interface DashboardConfig {
  hero?: {
    icon?: LucideIcon;
    titleKey?: string;
    subtitleKey?: string;
  };
  /** Fully-qualified message keys, resolved namespace-less. */
  starters?: string[];
  chatBasePath?: string;
}

export const dashboardConfig: DashboardConfig = {
  hero: {
    icon: Sparkles,
    titleKey: "dashboard.hero.title",
    subtitleKey: "dashboard.hero.subtitle",
  },
  starters: [
    "dashboard.starters.first",
    "dashboard.starters.second",
    "dashboard.starters.third",
  ],
  chatBasePath: "/chat",
};
