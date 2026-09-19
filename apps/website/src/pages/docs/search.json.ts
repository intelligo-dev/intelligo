/**
 * The docs search index, built with the site: one row per page, with the
 * headings a reader might be looking for. Static, so search needs no
 * service and cannot name a page that does not exist.
 */
import type { APIRoute } from "astro";
import { render } from "astro:content";

import { docHref, orderedDocs, sectionTitle } from "@/lib/docs-nav";

export type SearchRow = {
  href: string;
  title: string;
  section: string;
  description: string;
  headings: { slug: string; text: string }[];
};

export const GET: APIRoute = async () => {
  const docs = await orderedDocs();
  const rows: SearchRow[] = await Promise.all(
    docs.map(async (d) => {
      const { headings } = await render(d);
      return {
        href: docHref(d.id),
        title: d.data.title,
        section: sectionTitle(d.id),
        description: d.data.description,
        headings: headings
          .filter((h) => h.depth === 2 || h.depth === 3)
          .map((h) => ({ slug: h.slug, text: h.text })),
      };
    })
  );
  return new Response(JSON.stringify(rows), {
    headers: { "Content-Type": "application/json" },
  });
};
