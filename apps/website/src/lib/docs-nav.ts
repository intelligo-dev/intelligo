import { getCollection, type CollectionEntry } from "astro:content";

/** The docs sections, in reading order. An entry's section is its first path segment. */
export const DOC_SECTIONS = [
  { id: "getting-started", title: "Getting started" },
  { id: "concepts", title: "Concepts" },
  { id: "registry", title: "Registry" },
  { id: "packages", title: "Packages" },
  { id: "cli", title: "CLI" },
  { id: "guides", title: "Guides" },
] as const;

export type DocEntry = CollectionEntry<"docs">;

export const docHref = (id: string) => `/docs/${id}`;

const sectionOf = (id: string) => id.split("/")[0]!;

/** Every doc in sidebar order; prev/next walk this list. */
export async function orderedDocs(): Promise<DocEntry[]> {
  const docs: DocEntry[] = await getCollection("docs");
  const unknown = docs.filter(
    (d) => !DOC_SECTIONS.some((s) => s.id === sectionOf(d.id))
  );
  if (unknown.length) {
    throw new Error(
      `docs outside a known section: ${unknown.map((d) => d.id).join(", ")} — add the section to DOC_SECTIONS`
    );
  }
  const rank = (d: DocEntry) =>
    DOC_SECTIONS.findIndex((s) => s.id === sectionOf(d.id));
  return docs.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.data.order - b.data.order ||
      a.id.localeCompare(b.id)
  );
}

export async function docsSidebar() {
  const docs = await orderedDocs();
  return DOC_SECTIONS.map((s) => ({
    ...s,
    items: docs
      .filter((d) => sectionOf(d.id) === s.id)
      .map((d) => ({
        id: d.id,
        href: docHref(d.id),
        label: d.data.label ?? d.data.title,
        /** Package pages are named after the package: set in mono. */
        code: s.id === "packages" && d.id !== "packages",
      })),
  })).filter((s) => s.items.length > 0);
}

export function sectionTitle(id: string): string {
  return DOC_SECTIONS.find((s) => s.id === sectionOf(id))?.title ?? "";
}
