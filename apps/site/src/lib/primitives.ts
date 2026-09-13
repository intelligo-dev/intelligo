/**
 * The design-system catalog (ADR-0013). T1 and T2 are the shadcn
 * base-nova components installed in this site with the shadcn CLI —
 * the same files a consumer gets. T3 and T4 are Intelligo items the
 * registry migration ships; they are listed here as planned until they
 * exist. The build fails if an installed component has no entry, or a
 * block depends on a component the catalog does not have.
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
    lede: "Reasoning, tool calls, code and sources — ported from Vercel AI Elements to base-nova until upstream supports Base UI.",
  },
  T4: {
    title: "Intelligo patterns",
    lede: "Only what at least three blocks repeat and no tier above covers.",
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

/** Planned tiers: shipped by the registry migration (ADR-0013 §6). */
export const PLANNED: { name: string; tier: Tier; description: string }[] = [
  {
    name: "ai-prompt-input",
    tier: "T3",
    description:
      "The composer: autosizing textarea, attachments, submit and stop.",
  },
  {
    name: "ai-reasoning",
    tier: "T3",
    description: "Streamed reasoning, collapsible, with its duration.",
  },
  {
    name: "ai-tool",
    tier: "T3",
    description: "A tool call: name, state, input and output.",
  },
  {
    name: "ai-code-block",
    tier: "T3",
    description: "Highlighted code with copy.",
  },
  { name: "ai-sources", tier: "T3", description: "The sources a reply cites." },
  {
    name: "ai-suggestion",
    tier: "T3",
    description: "Conversation starters and follow-ups.",
  },
  {
    name: "ai-artifact",
    tier: "T3",
    description: "A generated document, linked from the turn that made it.",
  },
  {
    name: "page-header",
    tier: "T4",
    description: "The one page title: heading, description, actions.",
  },
  {
    name: "stat-card",
    tier: "T4",
    description: "A metric: label, value, change.",
  },
  {
    name: "status-badge",
    tier: "T4",
    description: "A status in a status token — never a palette colour.",
  },
  {
    name: "copy-button",
    tier: "T4",
    description: "Copy with confirmation, the same everywhere.",
  },
];

export type CatalogEntry = {
  name: ComponentName;
  tier: Tier;
  description: string;
  /** Registry blocks that list this component in registryDependencies. */
  usedBy: string[];
};

type RawItem = { name: string; type: string; registryDependencies?: string[] };
const blocks = (registry as { items: RawItem[] }).items.filter(
  (i) => i.type === "registry:block" && i.name !== "smoke"
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
].filter((n) => !(n in INSTALLED));
if (undocumented.length || missing.length || unknownDeps.length) {
  throw new Error(
    `primitives.ts is out of sync — undocumented: [${undocumented}] not installed: [${missing}] unknown registryDependencies: [${unknownDeps}]`
  );
}
