/**
 * The design-system catalog. T1 and T2 are the shadcn
 * base-nova components installed in this site with the shadcn CLI —
 * the same files a consumer gets. T3 and T4 are Intelligo's own
 * `registry:ui` items, read from registry.json so a new one appears here
 * and a retired one disappears. The build fails if an installed
 * component has no entry, or a block depends on a component the catalog
 * does not have.
 */
import registry from "@/data/registry.json";

export type Tier = "T1" | "T2" | "T3" | "T4";

export const TIERS: Record<Tier, { title: string; lede: string }> = {
  T1: {
    title: "Primitives",
    lede: "Stock shadcn base-nova components on Base UI. Blocks name them bare in registryDependencies.",
  },
  T2: {
    title: "Composites",
    lede: "Official shadcn compositions: forms, empty states, items, input groups, and the conversation surface.",
  },
  T3: {
    title: "AI parts",
    lede: "The parts an agent's interface is made of — messages, reasoning, tool calls, approvals, citations, artifacts — on Base UI and the token contract.",
  },
  T4: {
    title: "Intelligo patterns",
    lede: "Page furniture every block repeats and no tier above covers: page header, stat card, status badge, copy button, document viewer.",
  },
};

const INSTALLED = {
  // T1
  alert: ["T1", "An inline callout for a status, a warning or an error."],
  "alert-dialog": [
    "T1",
    "A modal that confirms a destructive or irreversible action.",
  ],
  avatar: ["T1", "A user or workspace picture with fallback, badge and group."],
  badge: ["T1", "A small label for roles, statuses and counts."],
  button: [
    "T1",
    "The action primitive — six variants, eight sizes, composes through render.",
  ],
  card: ["T1", "A surface with header, action, content and footer slots."],
  dialog: ["T1", "A modal window for forms and focused tasks."],
  "dropdown-menu": [
    "T1",
    "Actions, checkboxes and radio groups, with submenus.",
  ],
  input: ["T1", "A single-line text field."],
  label: ["T1", "An accessible label bound to a form control."],
  popover: ["T1", "Floating content anchored to a trigger."],
  progress: ["T1", "A bar for quota, credits and step completion."],
  "scroll-area": ["T1", "A scroll container with a styled scrollbar."],
  select: ["T1", "A picker for one value from a list."],
  separator: ["T1", "A horizontal or vertical rule."],
  sheet: ["T1", "A panel that slides in from any edge; the sidebar on mobile."],
  sidebar: [
    "T1",
    "The app sidebar — collapsible to icons, keyboard-toggled, a sheet on mobile.",
  ],
  skeleton: ["T1", "A loading placeholder in the shape of the content."],
  sonner: [
    "T1",
    "Toasts. The one notification seam every block reports through.",
  ],
  table: ["T1", "Rows and columns for members, invitations and executions."],
  tabs: ["T1", "Switches between views — default and line variants."],
  textarea: ["T1", "A multi-line text field."],
  tooltip: ["T1", "A short hint on hover or focus."],
  // T2
  field: [
    "T2",
    "Label, control, description and error as one accessible unit. Every form is Field.",
  ],
  empty: ["T2", "The empty state: media, title, description and an action."],
  item: [
    "T2",
    "A row of media, content and actions — lists, settings rows, search results.",
  ],
  "input-group": [
    "T2",
    "An input or textarea with inline addons, buttons and text.",
  ],
  "button-group": ["T2", "Related buttons joined into one control."],
  spinner: [
    "T2",
    "Pending state. Pair with disabled and aria-busy; never a bare Loader2.",
  ],
  kbd: ["T2", "A keyboard key or shortcut."],
  "message-scroller": [
    "T2",
    "The conversation viewport: sticks to the newest message while it streams.",
  ],
  message: [
    "T2",
    "One turn in a conversation — avatar, header, content, footer.",
  ],
  bubble: ["T2", "The body of a message, aligned to its author."],
  attachment: ["T2", "A file attached to a message or a prompt."],
  marker: ["T2", "A divider or status line inside a conversation."],
} as const satisfies Record<string, readonly [Tier, string]>;

export type ComponentName = keyof typeof INSTALLED;

export type CatalogEntry = {
  name: ComponentName;
  tier: Tier;
  description: string;
  /** Registry blocks that list this component in registryDependencies. */
  usedBy: string[];
};

type RawItem = {
  name: string;
  type: string;
  title?: string;
  description?: string;
  registryDependencies?: string[];
};
const rawItems = (registry as { items: RawItem[] }).items;
const blocks = rawItems.filter(
  (i) => i.type === "registry:block" && i.name !== "smoke"
);

/** Intelligo's own components (T3/T4); blocks name them `@intelligo/<name>`. */
const INTELLIGO_UI = new Set(
  rawItems.filter((i) => i.type === "registry:ui").map((i) => i.name)
);

export const CATALOG: CatalogEntry[] = (
  Object.keys(INSTALLED) as ComponentName[]
).map((name) => ({
  name,
  tier: INSTALLED[name][0],
  description: INSTALLED[name][1],
  usedBy: blocks
    .filter((b) => b.registryDependencies?.includes(name))
    .map((b) => b.name),
}));

/** Intelligo's own components: T3 AI parts and T4 patterns (`@intelligo/<name>`). */
export type IntelligoEntry = {
  name: string;
  title: string;
  tier: "T3" | "T4";
  group: string;
  description: string;
  usedBy: string[];
};

/** How the T3 parts are grouped on /components; an unlisted part lands in "More parts". */
const AI_GROUPS: Record<string, string[]> = {
  Conversation: [
    "ai-message",
    "ai-message-bubble",
    "ai-message-scroller",
    "ai-streaming-response",
    "ai-prompt-input",
    "ai-suggestion",
    "ai-branch",
    "ai-composer-menu",
    "ai-speech-input",
  ],
  "Agent at work": [
    "ai-agent-activity",
    "ai-agent-progress",
    "ai-reasoning",
    "ai-reasoning-text",
    "ai-shimmer-text",
    "ai-todo-list",
    "ai-tool-approval",
    "ai-tool-result",
    "ai-approval-card",
    "ai-file-diff",
  ],
  "What it produces": [
    "ai-citations",
    "ai-code-block",
    "ai-artifact",
    "ai-image-generation",
    "ai-sidebar",
    "ai-motion",
  ],
};
const groupOf = (name: string, tier: "T3" | "T4") =>
  tier === "T4"
    ? "Patterns"
    : (Object.entries(AI_GROUPS).find(([, names]) =>
        names.includes(name)
      )?.[0] ?? "More parts");

export const INTELLIGO: IntelligoEntry[] = rawItems
  .filter((i) => i.type === "registry:ui")
  .map((i) => {
    const text = i.description ?? "";
    const tier = text.match(/\((T[34])[^)]*\)/)?.[1] === "T3" ? "T3" : "T4";
    return {
      name: i.name,
      title: i.title ?? i.name,
      tier,
      group: groupOf(i.name, tier),
      description: text
        .replace(/\s*\((T[34])[^)]*\)/g, "")
        .replace(/\s+/g, " ")
        .trim(),
      usedBy: blocks
        .filter((b) => b.registryDependencies?.includes(`@intelligo/${i.name}`))
        .map((b) => b.name),
    };
  });

export const INTELLIGO_GROUPS = [
  ...Object.keys(AI_GROUPS),
  "More parts",
  "Patterns",
].filter((g) => INTELLIGO.some((e) => e.group === g));

/** Site-only marketing effects live beside the installed components and are not part of the system. */
const SITE_EFFECTS = new Set([
  "border-beam",
  "circuit-board",
  "infinite-slider",
  "kinetic-text-reveal",
  "shimmer-button",
  "spotlight-card",
  "text-morph",
]);

const installed = Object.keys(import.meta.glob("../components/ui/*.tsx"))
  .map((p) =>
    p
      .split("/")
      .pop()!
      .replace(/\.tsx$/, "")
  )
  .filter((n) => !SITE_EFFECTS.has(n));
const undocumented = installed.filter((n) => !(n in INSTALLED));
const missing = Object.keys(INSTALLED).filter((n) => !installed.includes(n));
const unknownDeps = [
  ...new Set(blocks.flatMap((b) => b.registryDependencies ?? [])),
].filter(
  (n) =>
    !(n in INSTALLED) &&
    !(n.startsWith("@intelligo/") && INTELLIGO_UI.has(n.slice(11)))
);
if (undocumented.length || missing.length || unknownDeps.length) {
  throw new Error(
    `primitives.ts is out of sync — undocumented: [${undocumented}] not installed: [${missing}] unknown registryDependencies: [${unknownDeps}]`
  );
}
