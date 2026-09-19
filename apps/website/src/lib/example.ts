/**
 * One product built on the framework, in five lines: what its team
 * wrote, what they did not, and where the two meet. The README carries
 * the same lines, and tests/architecture/docs.test.ts holds the two
 * together. Backticks mark inline code.
 */
export const EXAMPLE = {
  name: "Ignite",
  url: "https://app.ignite.mn",
  host: "app.ignite.mn",
  what: "a career advisor for Mongolian students",
  lede: "is a career advisor for Mongolian students, in beta with its first users — and an ordinary consumer of these packages from npm.",
  lines: [
    "Its team wrote the advisor: the prompts, the tools over their career data, their own tables.",
    "`create` and the registry gave it sign-up, workspaces, the shell, chat, billing and usage, as source in its repository.",
    "Plans, credits, metering and audit are `@intelligo-dev/*` versions it bumps.",
    "The two meet in config files — the agent's identity, its tools, the navigation, the plans. No installed page is edited.",
    "Every advisor turn is admitted against the workspace's plan, settled once, and recorded.",
  ],
} as const;
