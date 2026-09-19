export const BLOCKERS = [
  {
    tag: "verification",
    title: "You can't review code you didn't write.",
    body: "Tenancy bugs don't show up in a demo. They show up when a second workspace sees the first one's data.",
    evidence: [
      "$ pnpm vitest run packages/core/src/identity",
      "✓ refuses a read for another workspace's userId",
      "✓ scopes every query by workspaceId inside the service",
      "✓ deletes a fact only for its owner",
    ],
  },
  {
    tag: "cost",
    title: "The same login page, rebuilt from zero.",
    body: "Days and millions of tokens on infrastructure that has nothing to do with what makes your product yours.",
    evidence: [
      "$ intelligo add auth-login auth-signup",
      "✓ app/[locale]/(auth)/login/page.tsx",
      "✓ components/auth/auth-card.tsx",
      "✓ messages/en/auth-login.json — 0 tokens spent",
    ],
  },
  {
    tag: "entropy",
    title: "Messy code teaches messier code.",
    body: "A model writes in the style of what surrounds it. Start clean and every commit inherits that.",
    evidence: [
      "$ pnpm vitest run tests/architecture",
      "✓ package dependency direction",
      "✓ every model id used in the source is registered",
      "✓ no private import inside a registry item",
    ],
  },
];
