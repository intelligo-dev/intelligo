export const SITE = {
  name: "intelligo",
  title: "Intelligo — the application framework for vertical AI SaaS",
  description:
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
  version: "1.0.0-beta.1",
  status: "1.0.0-beta.1 · on npm",
  /** Flip once the repository is public: enables the live star count. */
  githubPublic: false,
} as const;

/**
 * Site navigation. Hash links resolve on the homepage; path links are
 * the secondary pages that hold the material the homepage only summarises.
 */
export const NAV = [
  { href: "/#framework", label: "Framework" },
  { href: "/pages", label: "Pages" },
  { href: "/architecture", label: "Architecture" },
  { href: SITE.docs, label: "Docs" },
] as const;
