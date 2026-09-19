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
    lede: "The interactive building blocks, on Base UI with shadcn's API kept. Blocks name them bare in registryDependencies.",
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
    "The action primitive — a pill that presses in; six variants, eight sizes, composes through render.",
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
  tabs: ["T1", "Switches between views; one indicator glides from tab to tab."],
  textarea: ["T1", "A multi-line text field."],
  tooltip: [
    "T1",
    "A short hint that grows out of its trigger on hover or focus.",
  ],
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

type RawItem = {
  name: string;
  type: string;
  title?: string;
  description?: string;
  dependencies?: string[];
  registryDependencies?: string[];
};
const rawItems = (registry as { items: RawItem[] }).items;
const blocks = rawItems.filter(
  (i) => i.type === "registry:block" && i.name !== "smoke"
);

/** Intelligo's own components; blocks name them `@intelligo/<name>`. */
const INTELLIGO_UI = new Map(
  rawItems.filter((i) => i.type === "registry:ui").map((i) => [i.name, i])
);

/** Intelligo primitives the site itself does not install. */
const T1_EXTRA = new Set([
  "checkbox",
  "radio-group",
  "switch",
  "collapsible",
  "command",
]);

/** How Intelligo's own components are grouped on /components; an unlisted `ai-*` part lands in "More parts". */
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
    "ai-markdown",
    "ai-artifact",
    "ai-image-generation",
    "ai-sidebar",
    "ai-motion",
  ],
};
const PATTERNS = new Set([
  "page-header",
  "stat-card",
  "status-badge",
  "copy-button",
  "document-viewer",
]);

export type ComponentEntry = {
  name: string;
  title: string;
  tier: Tier;
  group: string;
  description: string;
  /** Installed from intelligo.dev/r rather than shadcn's registry. */
  intelligo: boolean;
};

/** "AI Message Bubble" → "Message bubble", "alert-dialog" → "Alert dialog". */
const readable = (s: string) =>
  s
    .replace(/^AI\s+/, "")
    .replace(/-/g, " ")
    .trim()
    .split(/\s+/)
    .map((w, i) =>
      /^[A-Z]{2,}$/.test(w)
        ? w
        : i === 0
          ? w[0]!.toUpperCase() + w.slice(1).toLowerCase()
          : w.toLowerCase()
    )
    .join(" ");

const entry = (
  name: string,
  tier: Tier,
  group: string,
  fallback = ""
): ComponentEntry => {
  const item = INTELLIGO_UI.get(name);
  return {
    name,
    title: readable(item?.title ?? name),
    tier,
    group,
    description: item?.description ?? fallback,
    intelligo: !!item,
  };
};

const own = [...INTELLIGO_UI.keys()].filter(
  (n) => !(n in INSTALLED) && !T1_EXTRA.has(n)
);

const GROUP_ORDER = [
  ...Object.keys(AI_GROUPS),
  "More parts",
  "Patterns",
  "Motion",
  "Primitives",
  "Composites",
];

/** Every component on /components, in page order. */
export const COMPONENTS: ComponentEntry[] = [
  ...own
    .filter((n) => n.startsWith("ai-"))
    .map((n) =>
      entry(
        n,
        "T3",
        Object.entries(AI_GROUPS).find(([, names]) => names.includes(n))?.[0] ??
          "More parts"
      )
    ),
  ...own.filter((n) => PATTERNS.has(n)).map((n) => entry(n, "T4", "Patterns")),
  ...own
    .filter((n) => !n.startsWith("ai-") && !PATTERNS.has(n))
    .map((n) => entry(n, "T4", "Motion")),
  ...(Object.keys(INSTALLED) as ComponentName[])
    .filter((n) => INSTALLED[n][0] === "T1")
    .map((n) => entry(n, "T1", "Primitives", INSTALLED[n][1])),
  ...[...T1_EXTRA].map((n) => entry(n, "T1", "Primitives")),
  ...(Object.keys(INSTALLED) as ComponentName[])
    .filter((n) => INSTALLED[n][0] === "T2")
    .map((n) => entry(n, "T2", "Composites", INSTALLED[n][1])),
].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));

/** The groups that have at least one component, in page order. */
export const GROUPS = GROUP_ORDER.filter((g) =>
  COMPONENTS.some((e) => e.group === g)
);

/** Intelligo's own AI parts, patterns and motion (T3/T4). */
export const INTELLIGO = COMPONENTS.filter(
  (e) => e.tier === "T3" || e.tier === "T4"
);

/** The components installed from intelligo.dev/r: each has its own page. */
export const COMPONENT_PAGES = COMPONENTS.filter((e) => e.intelligo);

/** A component's page on this site, or its place in the catalog when it has none. */
export const componentHref = (name: string) =>
  INTELLIGO_UI.has(name) ? `/components/${name}` : `/components#${name}`;

/** What a component's page lists beside the demo, from its registry item. */
export function componentDetails(name: string) {
  const item = INTELLIGO_UI.get(name);
  return {
    dependencies: item?.dependencies ?? [],
    builtOn: (item?.registryDependencies ?? [])
      .filter((d) => d.startsWith("@intelligo/"))
      .map((d) => d.replace(/^@intelligo\//, "")),
    usedBy: blocks
      .filter((b) => b.registryDependencies?.includes(`@intelligo/${name}`))
      .map((b) => ({ name: b.name, title: b.title ?? b.name })),
  };
}

/** The shadcn tiers underneath (T1/T2). */
export const CATALOG = COMPONENTS.filter(
  (e) => e.tier === "T1" || e.tier === "T2"
);

/** Site-only marketing effects live beside the installed components and are not part of the system. */
const SITE_EFFECTS = new Set(["text-reveal"]);

const installed = Object.keys(import.meta.glob("../components/ui/*.tsx"))
  .map((p) =>
    p
      .split("/")
      .pop()!
      .replace(/\.tsx$/, "")
  )
  .filter((n) => !SITE_EFFECTS.has(n));
const undocumented = installed.filter(
  (n) => !(n in INSTALLED) && !INTELLIGO_UI.has(n)
);
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
