/**
 * Dashboard configuration — consumer-owned, imported by client
 * components (so, like `nav-config.ts`, it may hold React/Lucide
 * component values that must never cross the RSC boundary as props).
 *
 * The shipped defaults render a complete, honest AI-first home with no
 * editing: a hero from this item's own messages, a prompt bar that
 * opens a new conversation, recent conversations, and a compact plan
 * summary. Every part is replaceable here rather than in a component:
 *
 *  - `hero`: icon plus fully-qualified message keys for the title and
 *    subtitle. Point them at your product's namespace to say what this
 *    workspace is actually for.
 *  - `starters`: fully-qualified message keys (the `chatConfig.starters`
 *    contract). Each renders as a card that opens a new conversation
 *    prefilled with that text. Empty hides the grid.
 *  - `chatBasePath`: where the prompt bar and starters send the user.
 *    Defaults to the `chat` item's `/chat`; change it if your chat
 *    surface lives elsewhere, and note that the whole prompt-bar
 *    affordance only makes sense with a chat surface installed.
 *  - `shortcuts`: secondary links under the plan summary.
 *  - `showPlanSummary`: set false for a product that doesn't want
 *    billing state on its home page at all.
 */

import {
  BarChart3,
  FileText,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface DashboardShortcut {
  titleKey: string;
  href: string;
  icon: LucideIcon;
}

export interface DashboardConfig {
  hero?: {
    icon?: LucideIcon;
    titleKey?: string;
    subtitleKey?: string;
  };
  /** Fully-qualified message keys, resolved namespace-less. */
  starters?: string[];
  chatBasePath?: string;
  shortcuts?: DashboardShortcut[];
  showPlanSummary?: boolean;
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
  shortcuts: [
    {
      titleKey: "dashboard.shortcuts.artifacts",
      href: "/artifacts",
      icon: FileText,
    },
    { titleKey: "dashboard.shortcuts.usage", href: "/usage", icon: BarChart3 },
    {
      titleKey: "dashboard.shortcuts.team",
      href: "/settings/team",
      icon: Users,
    },
  ],
  showPlanSummary: true,
};
