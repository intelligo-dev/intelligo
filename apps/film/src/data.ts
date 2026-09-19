/**
 * A point-in-time snapshot of what the film's beats name — registry item
 * groups, the framework package ids `pnpm add` lists, and the version
 * that types into the terminal. Source of truth if this ever needs a
 * refresh: packages/registry/registry.json (item names/groups, via
 * apps/site/src/lib/registry-items.ts's GROUPS map) and
 * packages/core/package.json's version. Not auto-synced — a rendered
 * video is a snapshot, not a live page.
 */

export type RegistryGroup = "Auth" | "Shell" | "Settings" | "Commerce" | "AI";

const GROUPS: Record<RegistryGroup, string[]> = {
  Auth: [
    "auth-login",
    "auth-signup",
    "auth-password-reset",
    "auth-email-verification",
    "onboarding",
    "invitation-accept",
  ],
  Shell: [
    "app-shell",
    "dashboard",
    "notifications",
    "language-switcher",
    "trial-banner",
    "route-error",
  ],
  Settings: [
    "settings-shell",
    "workspace-settings",
    "team-settings",
    "profile-settings",
    "privacy-settings",
  ],
  Commerce: [
    "pricing",
    "checkout",
    "billing-settings",
    "usage",
    "feature-gating",
    "payment-poll",
  ],
  AI: ["chat", "chat-panel", "chat-widget", "chat-share", "artifacts"],
};

export type RegistryItem = { name: string; group: RegistryGroup };

export const REGISTRY_ITEMS: RegistryItem[] = (
  Object.keys(GROUPS) as RegistryGroup[]
).flatMap((group) => GROUPS[group].map((name) => ({ name, group })));

/** The framework layer of the package map, in `pnpm add` order. */
export const PACKAGES = [
  "auth",
  "billing",
  "chat",
  "next",
  "executions",
  "core",
  "audit",
  "jobs",
  "admin",
];

/** The published version, from packages/core/package.json. */
export const PACKAGE_VERSION = "1.0.0-beta.8";
