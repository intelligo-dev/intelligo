/**
 * The registry explorer reads the framework's registry.json — copied in
 * by `pnpm sync` — at build time, so the site can never list an item
 * that doesn't exist. Grouping and the mini previews are the only
 * site-owned data.
 */
import registry from "@/data/registry.json";

export type RegistryItem = {
  name: string;
  title: string;
  /** First sentence, for compact lists. */
  description: string;
  fullDescription: string;
  /** The shadcn primitives the item installs with (`registryDependencies`). */
  primitives: string[];
  /** npm packages the item adds. */
  dependencies: string[];
  fileCount: number;
  /** Where each file lands in the consumer app. */
  files: { target: string; type: string }[];
  /** The installed files a deployment edits: the item's seams (ADR-0010). */
  seams: string[];
  group: RegistryGroup;
  dependsOn: string[];
};

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

const DEPENDS: Record<string, string[]> = {
  "chat-panel": ["chat"],
  "chat-widget": ["chat"],
  "chat-share": ["chat"],
  "auth-signup": ["auth-login"],
  "auth-password-reset": ["auth-login"],
  "auth-email-verification": ["auth-login"],
  "invitation-accept": ["team-settings"],
  checkout: ["pricing"],
  "billing-settings": ["pricing"],
  "payment-poll": ["pricing"],
  dashboard: ["chat", "pricing"],
  "workspace-settings": ["settings-shell"],
  "team-settings": ["settings-shell"],
  "profile-settings": ["settings-shell"],
  "privacy-settings": ["settings-shell"],
};

type RawItem = {
  name: string;
  type: string;
  title?: string;
  description?: string;
  registryDependencies?: string[];
  dependencies?: string[];
  files?: { path: string; type: string; target?: string }[];
};
// Blocks only: the design-system base item (ADR-0013) configures an app
// and is not a page family.
const raw = (registry as { items: RawItem[] }).items.filter(
  (i) => i.type === "registry:block" && i.name !== "smoke"
);

/** Consumer-owned config: `lib/nav-config.ts`, `lib/onboarding-steps.ts`, `lib/chat-renderers.tsx`… */
const SEAM = /^lib\/[^/]*(config|steps|renderers|patterns|bootstrap)\.tsx?$/;

export const REGISTRY_ITEMS: RegistryItem[] = (
  Object.keys(GROUPS) as RegistryGroup[]
).flatMap((group) =>
  GROUPS[group]
    .map((name) => raw.find((i) => i.name === name))
    .filter((i): i is RawItem => !!i)
    .map((i) => ({
      name: i.name,
      title: i.title ?? i.name,
      description: firstSentence(i.description ?? ""),
      fullDescription: (i.description ?? "").replace(/\s+/g, " "),
      primitives: i.registryDependencies ?? [],
      dependencies: i.dependencies ?? [],
      fileCount: i.files?.length ?? 0,
      files: (i.files ?? []).map((f) => ({
        target: f.target ?? f.path,
        type: f.type.replace(/^registry:/, ""),
      })),
      seams: (i.files ?? [])
        .map((f) => f.target ?? f.path)
        .filter((t) => SEAM.test(t)),
      group,
      dependsOn: DEPENDS[i.name] ?? [],
    }))
);

export const REGISTRY_COUNT = raw.length;

export const REGISTRY_GROUPS = Object.keys(GROUPS) as RegistryGroup[];

/** A block's page on this site. */
export const blockHref = (name: string) => `/blocks/${name}`;

function firstSentence(s: string): string {
  const m = s.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : s).replace(/\s+/g, " ");
}

/** Sanity: every grouped name exists in registry.json. */
const grouped = Object.values(GROUPS).flat();
const missing = grouped.filter((n) => !raw.some((i) => i.name === n));
const ungrouped = raw.map((i) => i.name).filter((n) => !grouped.includes(n));
if (missing.length || ungrouped.length) {
  throw new Error(
    `registry-items.ts is out of sync with registry.json — missing: [${missing}] ungrouped: [${ungrouped}]`
  );
}
