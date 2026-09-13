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
  adrs: "https://github.com/intelligo-mn/framework/tree/main/docs/adr",
  /** Implementation docs live in the framework README until a docs site exists. */
  docs: "https://github.com/intelligo-mn/framework#quickstart",
  npm: "https://www.npmjs.com/org/intelligo-dev",
  /** The hosted registry: `pnpm exec shadcn add https://intelligo.dev/r/<item>.json`. */
  registryBase: "https://intelligo.dev/r",
  /** From `pnpm --filter site sync`, so the site never names a version that is not on npm. */
  version: proof.version as string,
  status: `${proof.version} · on npm`,
  /** The repository is public: the nav shows the live star count. */
  githubPublic: true,
} as const;

/**
 * Site navigation. Hash links resolve on the homepage; path links are
 * the secondary pages that hold the material the homepage only summarises.
 */
export const NAV = [
  { href: "/#film", label: "The film" },
  { href: "/pages", label: "Pages" },
  { href: "/blocks", label: "Blocks" },
  { href: "/components", label: "Components" },
  { href: "/architecture", label: "Architecture" },
  { href: SITE.docs, label: "Docs" },
] as const;
