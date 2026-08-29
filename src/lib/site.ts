export const SITE = {
  name: "intelligo",
  title: "Intelligo — the application framework for vertical AI SaaS",
  description:
    "You build the agent. Intelligo is everything around it — tenancy, billing, credits, execution accounting, the pages, the admin console — tested, typed, and installed as source you own. Open source, Apache-2.0.",
  github: "https://github.com/intelligo-mn/framework",
  githubOwner: "intelligo-mn",
  githubRepo: "framework",
  license: "https://github.com/intelligo-mn/framework/blob/main/LICENSE",
  adrs: "https://github.com/intelligo-mn/framework/tree/main/docs/adr",
  status: "1.0.0-beta.1 · on npm",
  /** Flip once the repository is public: enables the live star count. */
  githubPublic: false,
} as const;

export const NAV = [
  { href: "#why", label: "Why" },
  { href: "#boundary", label: "The boundary" },
  { href: "#pages", label: "Pages" },
  { href: "#quickstart", label: "Quickstart" },
  { href: "#faq", label: "FAQ" },
] as const;
