import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// intelligo.dev — the framework's public site. Its own repository, no
// `@intelligo-dev/*` dependency: what it shows about the framework
// (registry items, counts, history) is pulled in by `pnpm sync` and
// committed, so this site keeps building whatever the packages do.
// React is here only as islands for interactive bits pulled from
// shadcn registries (stat cards, shimmering text).
export default defineConfig({
  output: "static",
  site: "https://intelligo.dev",
  integrations: [react(), sitemap({ filter: (page) => !page.endsWith("/404/") })],
  vite: {
    plugins: [tailwindcss()],
  },
});
