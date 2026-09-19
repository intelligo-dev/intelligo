import proof from "@/data/proof.json";

export const SITE = {
  name: "intelligo",
  title: "Intelligo — the application framework for vertical AI SaaS",
  /** ≤160 characters: what search engines and link previews show. */
  description:
    "Open-source application framework for vertical AI SaaS — auth, workspaces, billing, credits and execution accounting. You build the agent; your AI framework stays native.",
  /** The long form, for the footer and the social card. */
  tagline:
    "You build the agent. Intelligo is everything around it — auth, workspaces, billing, credits, execution accounting, pages and operations — shipped as versioned packages and consumer-owned source. Your AI framework stays native. Open source, Apache-2.0.",
  github: "https://github.com/intelligo-mn/framework",
  githubOwner: "intelligo-mn",
  githubRepo: "framework",
  license: "https://github.com/intelligo-mn/framework/blob/main/LICENSE",
  docs: "/docs",
  /** Where every "Get started" lands. */
  start: "/docs/getting-started",
  npm: "https://www.npmjs.com/org/intelligo-dev",
  /** The hosted registry: `pnpm exec shadcn add https://intelligo.dev/r/<item>.json`. */
  registryBase: "https://intelligo.dev/r",
  /** From `pnpm --filter site sync`, so the site never names a version that is not on npm. */
  version: proof.version as string,
  status: `${proof.version} · on npm`,
  /** The repository is public: the nav shows the live star count. */
  githubPublic: true,
  /**
   * The homepage film (apps/film, rendered with Remotion), one render
   * per theme, served from `public/film/` with a still shown before it
   * plays. Re-render, then copy `apps/film/out/*.mp4` over these.
   */
  film: {
    light: { video: "/film/film-light.mp4", poster: "/film/poster-light.jpg" },
    dark: { video: "/film/film-dark.mp4", poster: "/film/poster-dark.jpg" },
  },
} as const;

/**
 * Site navigation: one entry per job — build with it (Docs), see and
 * install it (Blocks, Components), understand it (Architecture, Why).
 * An entry is active on its own path and everything under it.
 */
export const NAV = [
  { href: "/docs", label: "Docs" },
  { href: "/blocks", label: "Blocks" },
  { href: "/components", label: "Components" },
  { href: "/architecture", label: "Architecture" },
  { href: "/why", label: "Why" },
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
      { href: SITE.license, label: "License" },
    ],
  },
];
