/**
 * The shadcn primitives every registry item renders with. The files are
 * the reference app's own `components/ui/*`, copied in by `pnpm sync`;
 * the descriptions are the only site-owned data. The build fails if a
 * synced primitive has no entry here, or an item depends on a primitive
 * the app doesn't ship.
 */
import registry from "@/data/registry.json";

const META = {
  "alert-dialog":
    "A modal that interrupts to confirm a destructive or irreversible action.",
  alert: "An inline callout for a status, a warning or an error.",
  avatar:
    "A user or workspace picture with initials fallback, badge and group.",
  badge: "A small label for roles, statuses and counts.",
  button:
    "The action primitive — six variants, eight sizes, renders as a link through asChild.",
  card: "A surface with header, action, content and footer slots.",
  dialog: "A modal window for forms and focused tasks.",
  "dropdown-menu":
    "A menu of actions, checkboxes and radio groups, with submenus.",
  input: "A single-line text field.",
  label: "An accessible label bound to a form control.",
  popover:
    "Floating content anchored to a trigger, such as the notification inbox.",
  progress: "A bar for quota, credits and step completion.",
  "scroll-area": "A scroll container with a styled scrollbar.",
  select: "A picker for one value from a list.",
  separator: "A horizontal or vertical rule.",
  sheet: "A panel that slides in from any edge; the sidebar on mobile.",
  sidebar:
    "The composable app sidebar — collapsible, keyboard-toggled, a sheet on mobile.",
  skeleton: "A loading placeholder in the shape of the content it stands for.",
  table: "Rows and columns for members, invitations and executions.",
  tabs: "Switches between views — default and line variants.",
  textarea: "A multi-line text field.",
  tooltip: "A short hint on hover or focus.",
} as const;

export type PrimitiveName = keyof typeof META;

export type Primitive = {
  name: PrimitiveName;
  description: string;
  /** Registry items that list this primitive in `registryDependencies`. */
  usedBy: string[];
};

type RawItem = { name: string; type: string; registryDependencies?: string[] };
const items = (registry as { items: RawItem[] }).items.filter(
  (i) => i.type === "registry:block" && i.name !== "smoke"
);

export const PRIMITIVES: Primitive[] = (Object.keys(META) as PrimitiveName[])
  .sort()
  .map((name) => ({
    name,
    description: META[name],
    usedBy: items
      .filter((i) => i.registryDependencies?.includes(name))
      .map((i) => i.name),
  }));

/** Sanity: the list matches what the app ships and what the items need. */
const synced = Object.keys(
  import.meta.glob("../showcase/app/components/ui/*.tsx")
).map((p) =>
  p
    .split("/")
    .pop()!
    .replace(/\.tsx$/, "")
);
const undocumented = synced.filter((n) => !(n in META));
const unsynced = Object.keys(META).filter((n) => !synced.includes(n));
const unknownDeps = [
  ...new Set(items.flatMap((i) => i.registryDependencies ?? [])),
].filter((n) => !(n in META));
if (undocumented.length || unsynced.length || unknownDeps.length) {
  throw new Error(
    `primitives.ts is out of sync — undocumented: [${undocumented}] not synced: [${unsynced}] unknown registryDependencies: [${unknownDeps}]`
  );
}
