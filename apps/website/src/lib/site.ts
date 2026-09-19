import proof from "@/data/proof.json";

const PUBLISHED = proof.published as string;

export const SITE = {
  name: "intelligo",
  title: "Intelligo — the application framework for vertical AI SaaS",
  /** ≤160 characters: what search engines and link previews show. */
  description:
    "Open-source application framework for vertical AI SaaS — auth, workspaces, billing, credits and execution accounting. You build the agent; your AI framework stays native.",
  /** The long form, for the footer and the social card. */
  tagline:
    "You build the agent. Intelligo is everything around it — auth, workspaces, billing, credits, execution accounting, pages and operations — shipped as versioned packages and consumer-owned source. Your AI framework stays native. Open source, Apache-2.0.",
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
 * Site navigation: what a reader comes back for — build with it (Docs),
 * see and install it (Blocks, Components). /architecture and /why are
 * read once, and are reached from the homepage's sections and the footer.
 * An entry is active on its own path and everything under it.
 */
export const NAV = [
  { href: "/docs", label: "Docs" },
  { href: "/blocks", label: "Blocks" },
  { href: "/components", label: "Components" },
] as const;

export const FOOTER: {
  title: string;
  links: { href: string; label: string }[];
}[] = [
  {
    title: "Product",
    links: [
      { href: "/why", label: "Why Intelligo" },
      { href: "/why#compare", label: "Compare" },
      { href: "/architecture", label: "Architecture" },
    ],
  },
  {
    title: "Registry",
    links: [
      { href: "/blocks", label: "Blocks" },
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
