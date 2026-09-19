/**
 * What your product adds around the app shell, without editing
 * `layout.tsx` or `components/shell/*`. Every slot is optional and takes
 * a component with no props; one that needs data fetches it itself.
 *
 *  - `bannerTop`: above the page content on every authenticated page
 *    (a trial banner, an incident notice).
 *  - `headerRight`: the right end of the header (a notification bell,
 *    a language switcher).
 *  - `sidebarContent`: the sidebar under the navigation (conversation
 *    history). May be an async server component; it refreshes with the
 *    page. Hiding itself when the sidebar collapses is its own call.
 *
 * For example:
 *
 *   import { TrialBanner } from "@showcase/components/trial/trial-banner";
 *
 *   export const shellConfig: ShellConfig = {
 *     bannerTop: TrialBanner,
 *   };
 */

import type { ComponentType } from "react";

export interface ShellConfig {
  /** Rendered inside `SidebarInset`, above `main`. Takes no props. */
  bannerTop?: ComponentType;
  /**
   * Rendered at the right end of the shell header — e.g. a
   * notification bell, a language switcher, or both. Takes no props.
   */
  headerRight?: ComponentType;
  /**
   * Rendered in the sidebar under the navigation — e.g. conversation
   * history. Takes no props; may be an async server component.
   */
  sidebarContent?: ComponentType;
}

export const shellConfig: ShellConfig = {};
