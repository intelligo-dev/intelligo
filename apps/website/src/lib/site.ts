import proof from "@/data/proof.json";

const PUBLISHED = proof.published as string;

export const SITE = {
  name: "intelligo",
  title: "Intelligo — everything your AI product needs, except the AI",
  /** ≤160 characters: what search engines and link previews show. */
  description:
    "Open-source framework for AI SaaS: sign-up, teams, plans, credits, per-run cost and an admin console. Pages you own, packages you upgrade. Your agent stays yours.",
  /** The long form, for the footer and the social card. */
  tagline:
    "You build the agent. Intelligo is everything around it — sign-up, teams, plans, credits, per-run cost and an admin console — as pages you own and packages you upgrade. Your AI framework stays native. Open source, Apache-2.0.",
  github: "https://github.com/intelligo-dev/intelligo",
  githubOwner: "intelligo-dev",
  githubRepo: "intelligo",
  license: "https://github.com/intelligo-dev/intelligo/blob/main/LICENSE",
  changelog:
    "https://github.com/intelligo-dev/intelligo/blob/main/CHANGELOG.md",
  docs: "/docs",
  /** Where every "Get started" lands. */
  start: "/docs/getting-started",
  npm: "https://www.npmjs.com/org/intelligo-dev",
  /** The hosted registry, which a scaffold's components.json names `@intelligo`. */
  registryBase: "https://intelligo.dev/r",
  /**
   * What npm serves, read from its dist-tags by `pnpm sync` — not this
   * tree's version, which runs ahead of npm until its release lands.
   */
  version: PUBLISHED,
  status: `${PUBLISHED} · on npm`,
  /** The repository is public: the nav shows the live star count. */
  githubPublic: true,
  /**
   * The homepage film (tools/film, rendered with Remotion), one render
   * per theme, served from `public/film/` with a still shown before it
   * plays and the script as a captions track. Re-render, then copy
   * `tools/film/out/*.mp4` over these.
   */
  film: {
    light: { video: "/film/film-light.mp4", poster: "/film/poster-light.jpg" },
    dark: { video: "/film/film-dark.mp4", poster: "/film/poster-dark.jpg" },
    captions: "/film/film.en.vtt",
  },
} as const;

/**
 * Site navigation, by what a reader is asking: what it does (Product),
 * why not build or buy it another way (Why), how to build with it (Docs),
 * and the pages and components themselves (UI). An entry is active on its
 * own path and everything under it, and on any path in `also`.
 */
export const NAV: readonly {
  href: string;
  label: string;
  also?: readonly string[];
}[] = [
  { href: "/product", label: "Product" },
  { href: "/why", label: "Why" },
  { href: "/docs", label: "Docs" },
  { href: "/ui", label: "UI", also: ["/blocks", "/components"] },
];

export const FOOTER: {
  title: string;
  links: { href: string; label: string }[];
}[] = [
  {
    title: "Product",
    links: [
      { href: "/product", label: "What it does" },
      { href: "/why", label: "Why Intelligo" },
      { href: "/why#compare", label: "Compare" },
      { href: "/architecture", label: "Architecture" },
    ],
  },
  {
    title: "UI",
    links: [
      { href: "/ui", label: "Intelligo UI" },
      { href: "/blocks", label: "Pages" },
      { href: "/components", label: "Components" },
      { href: "/r/intelligo.json", label: "Hosted registry" },
    ],
  },
  {
    title: "Docs",
    links: [
      { href: SITE.start, label: "Getting started" },
      { href: "/docs/concepts/boundary", label: "Concepts" },
      { href: "/docs/packages", label: "Packages" },
      { href: "/docs/cli", label: "CLI" },
    ],
  },
  {
    title: "Project",
    links: [
      { href: SITE.github, label: "GitHub" },
      { href: SITE.npm, label: "npm" },
      { href: SITE.changelog, label: "Changelog" },
      { href: SITE.license, label: "License" },
    ],
  },
];
