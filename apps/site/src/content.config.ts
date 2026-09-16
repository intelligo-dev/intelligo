/**
 * The docs at /docs: Markdown under src/content/docs, one folder per
 * section. An entry's id is its path ("concepts/boundary"); a folder's
 * index.md is the section's own page ("packages"). Sidebar order is the
 * section list in lib/docs-nav.ts, then `order` within it.
 */
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const docs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/docs" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** Position within the section; the section's index page is 0. */
    order: z.number().default(100),
    /** Sidebar label when the title is too long for it. */
    label: z.string().optional(),
  }),
});

export const collections = { docs };
