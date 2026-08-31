/**
 * Shell composition config — the consumer-owned extension point for
 * everything a vertical wants to add around the authenticated app
 * shell without editing `layout.tsx` or `components/shell/*` (ADR-0005:
 * composition through a config a consumer owns, never a component
 * edit; mirrors the `chat` item's `lib/chat-config.tsx`).
 *
 * One seam so far, optional — a fresh install ships this file with an
 * empty `shellConfig`, so the shell renders nothing extra beyond its
 * baseline UI:
 *
 *  - `bannerTop`: a component `layout.tsx` renders inside
 *    `SidebarInset`, above `main` — e.g. a trial-status banner, an
 *    incident notice, or a plan-upgrade nudge that every authenticated
 *    page should see. It takes no props; a product binding one that
 *    needs data of its own (session, workspace, trial status) fetches
 *    it itself, the same way the first product's `TrialBanner` did
 *    before this seam existed. Default: nothing extra.
 *
 * Edit this file directly to point at your product's own components —
 * this is consumer-owned source, not a package import. Example, once
 * you have a product-specific banner component:
 *
 *   import { TrialBanner } from "@/components/trial/trial-banner";
 *
 *   export const shellConfig: ShellConfig = {
 *     bannerTop: TrialBanner,
 *   };
 */

import type { ComponentType } from "react";

import { HeaderExtras } from "@/components/shell/header-extras";
import { TrialBannerContainer } from "@/components/trial/trial-banner-container";

export interface ShellConfig {
  /** Rendered inside `SidebarInset`, above `main`. Takes no props. */
  bannerTop?: ComponentType;
  /**
   * Rendered at the right end of the shell header — e.g. a
   * notification bell, a language switcher, or both. Takes no props.
   */
  headerRight?: ComponentType;
}

/**
 * The reference app binds both seams: the trial banner (from the
 * `trial-banner` item — an async Server Component that fetches trial
 * status itself and renders nothing without an active trial) above the
 * content, and the notification bell + language switcher in the header.
 */
export const shellConfig: ShellConfig = {
  bannerTop: TrialBannerContainer,
  headerRight: HeaderExtras,
};
