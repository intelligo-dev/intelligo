import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders } from "astro/config";

import { codeFrame } from "./src/lib/markdown.mjs";
import ogImages from "./src/lib/og-images.mjs";

// intelligo.dev — the framework's public site. Its own repository, no
// `@intelligo-dev/*` dependency: what it shows about the framework
// (registry items, counts, history) is pulled in by `pnpm sync` and
// committed, so this site keeps building whatever the packages do.
// React is here only as islands for interactive bits pulled from
// shadcn registries (stat cards, shimmering text).
export default defineConfig({
  output: "static",
  site: "https://intelligo.dev",
  // One URL per page, without the slash: the form every link is written
  // in, and the one wrangler.jsonc serves (it redirects `/foo/` to it).
  trailingSlash: "never",
  integrations: [
    react(),
    sitemap({ filter: (page) => !/\/404\/?$/.test(page) }),
    ogImages(),
  ],
  // Docs code blocks carry both themes (global.css switches under .dark),
  // and a frame with a label and a copy button (src/lib/markdown.mjs).
  markdown: {
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
      transformers: [codeFrame],
    },
  },
  // Fonts are fetched at build time and served from this origin, with a
  // metric-matched fallback generated for each family — no third-party
  // stylesheet on the critical path, and no reflow when the font arrives.
  // Base.astro places them; global.css reads the variables.
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Geist",
      cssVariable: "--font-geist",
      weights: [400, 500, 600],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["-apple-system", "Segoe UI", "sans-serif"],
    },
    {
      provider: fontProviders.google(),
      name: "Geist Mono",
      cssVariable: "--font-geist-mono",
      weights: [400, 500],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["ui-monospace", "Menlo", "monospace"],
    },
    {
      provider: fontProviders.google(),
      name: "Outfit",
      cssVariable: "--font-outfit",
      weights: [400, 500, 600, 700],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["-apple-system", "Segoe UI", "sans-serif"],
    },
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
